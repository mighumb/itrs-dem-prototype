import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent } from 'react'
import { ArrowUp, Pencil, Play, Square } from 'lucide-react'
import BrowserPanel from '../components/BrowserPanel'
import CollapsedWorkspacePanel from '../components/CollapsedWorkspacePanel'
import { DetachedPanelsLayer, type DetachablePanelId } from '../components/DetachedPanelWindow'
import { AgentMessage } from '../components/GlobalAgent'
import AgentWorkStatus from '../components/AgentWorkStatus'
import JourneyTimeline from '../components/JourneyTimeline'
import MonitoringColumn from '../components/MonitoringColumn'
import WorkspacePanel from '../components/WorkspacePanel'
import {
  DEFAULT_OPEN_PANELS,
  getPanelFlexClass,
  shouldCenterWorkspace,
  usePanelOrder,
  type WorkspacePanelId,
} from '../hooks/usePanelOrder'
import {
  applyAgentStepFix,
  applyPostRunMessages,
  buildJourneyReadyMessage,
  buildRunOutcomeMessage,
  buildScheduleMessage,
  ensureFullJourneySteps,
  getBrowserFrameForStep,
  pickRandomFailureIndex,
  RUN_OUTCOME_MESSAGE_ID,
  withoutTransientRunMessages,
  type RunFailureInfo,
} from '../mock/data'
import { requestDiscoveryAi } from '../lib/discoveryAi'
import {
  type RecordedBrowserStep,
} from '../lib/extensionBridge'
import {
  agentIntroForLocale,
  buildJourneyFromDiscovery,
  buildJourneyFromPrompt,
  extractUrlFromText,
  runFallbackMessage,
  runLiveOkMessage,
  runStartMessage,
  runStoppedMessage,
  type JourneyLaunchSession,
} from '../lib/journeyLaunch'
import { recordedStepsToJourneySteps, recordingTitle } from '../lib/recordedSteps'
import { useLocale } from '../context/LocaleContext'
import { runLiveJourney } from '../lib/journeyRunAi'
import type { BrowserFrame, ChatMessage, JourneySchedule, JourneyStep } from '../types'
import { scheduleSummary } from '../types'
import type { DiscoveryPlan } from '../mock/discovery'

export interface NewJourneyHandle {
  commitAcceptSchedule: () => void
  commitCustomizeSchedule: (schedule: JourneySchedule) => void
}

interface NewJourneyProps {
  session: JourneyLaunchSession
  isMonitored: boolean
  onHeaderChange?: (header: { title: string; subtitle?: string }) => void
  onSave: () => void
  onAcceptSchedule: () => void
  onCustomizeSchedule: () => void
  onRequestNewJourney?: (prompt: string) => void
}

const STEP_DELAY = 1400
const TYPING_DELAY = 600

function planToJourneySteps(
  plan: DiscoveryPlan,
  previous: JourneyStep[],
  siteUrl?: string | null,
  locale: 'en' | 'fr' = 'en',
): JourneyStep[] {
  const built = buildJourneyFromDiscovery({
    plan,
    prompt: plan.prompt,
    siteUrl: siteUrl ?? null,
    locale,
  }).steps
  return built.map((step, index) => {
    const prev = previous[index]
    const sameIntent =
      prev &&
      prev.label.toLowerCase() === step.label.toLowerCase() &&
      prev.action.toLowerCase() === step.action.toLowerCase()
    return {
      ...step,
      id: sameIntent ? prev.id : step.id,
      duration: prev?.duration ?? step.duration,
      timeout: prev?.timeout ?? step.timeout,
      target: step.target ?? prev?.target,
      targetHint: step.targetHint ?? prev?.targetHint,
      href: step.href ?? prev?.href,
      status: 'pending' as const,
    }
  })
}

const NewJourney = forwardRef<NewJourneyHandle, NewJourneyProps>(function NewJourney(
  {
    session,
    isMonitored,
    onHeaderChange,
    onSave,
    onAcceptSchedule,
    onCustomizeSchedule,
    onRequestNewJourney,
  },
  ref,
) {
  const { t, tf, locale } = useLocale()

  const panelLabel = (id: WorkspacePanelId) => {
    switch (id) {
      case 'agent':
        return t('panelAgent')
      case 'steps':
        return t('panelSteps')
      case 'browser':
        return t('panelBrowser')
      case 'monitoring':
        return t('panelMonitoring')
    }
  }
  const initialPrompt = session.prompt
  const journey = useMemo(() => {
    if (session.plan) {
      return buildJourneyFromDiscovery({
        plan: session.plan,
        prompt: session.prompt,
        siteUrl: session.siteUrl,
        locale,
      })
    }
    return buildJourneyFromPrompt(session.prompt, session.siteUrl, locale)
  }, [session, locale])
  const [journeyName, setJourneyName] = useState(journey.name)
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    session.messages.length > 0 ? session.messages : [agentIntroForLocale(locale)],
  )
  const [steps, setSteps] = useState<JourneyStep[]>([])
  const [browserFrame, setBrowserFrame] = useState<BrowserFrame | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const [scheduleResolved, setScheduleResolved] = useState(false)
  const [fixActionsResolved, setFixActionsResolved] = useState(false)
  const [openPanels, setOpenPanels] = useState<Set<WorkspacePanelId>>(
    () => new Set(DEFAULT_OPEN_PANELS),
  )
  const [userClosedPanels, setUserClosedPanels] = useState<Set<WorkspacePanelId>>(
    () => new Set(),
  )
  const [detachedPanels, setDetachedPanels] = useState<Set<DetachablePanelId>>(() => new Set())
  const [editMode, setEditMode] = useState(false)
  const [input, setInput] = useState('')
  const [agentTyping, setAgentTyping] = useState(false)
  const [workStatus, setWorkStatus] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)
  const runIdRef = useRef(0)
  const scheduleResolvedRef = useRef(false)
  const runAbortRef = useRef<AbortController | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const isRunningRef = useRef(false)
  const lastFailedStepRef = useRef<RunFailureInfo | null>(null)
  const fixContinueInFlightRef = useRef(false)

  useEffect(() => {
    setJourneyName(journey.name)
  }, [journey.name])

  // Abort in-flight Playwright / chat when leaving the workspace.
  useEffect(() => {
    return () => {
      runAbortRef.current?.abort()
      chatAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    scheduleResolvedRef.current = scheduleResolved
  }, [scheduleResolved])

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  useImperativeHandle(ref, () => ({
    commitAcceptSchedule: () => {
      if (scheduleResolvedRef.current) return
      scheduleResolvedRef.current = true
      setScheduleResolved(true)
      setMessages((prev) => [
        ...prev,
        {
          id: 'user-schedule',
          role: 'user',
          content: t('scheduleAcceptedUser'),
        },
        {
          id: 'agent-schedule',
          role: 'agent',
          content: t('scheduleAcceptedAgent'),
        },
      ])
    },
    commitCustomizeSchedule: (schedule: JourneySchedule) => {
      if (scheduleResolvedRef.current) return
      scheduleResolvedRef.current = true
      setScheduleResolved(true)
      const summary = scheduleSummary(schedule, locale)
      setMessages((prev) => [
        ...prev,
        { id: 'user-custom', role: 'user', content: summary },
        {
          id: 'agent-custom',
          role: 'agent',
          content: tf('scheduleCustomAgent', { summary }),
        },
      ])
    },
  }))

  const scrollChat = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollChat()
  }, [messages, steps, agentTyping, scrollChat])

  // Keep workspace system messages in sync with the UI language toggle.
  useEffect(() => {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id === 'done-1') return buildJourneyReadyMessage(journey, locale)
        if (message.id === 'done-2') return buildScheduleMessage(locale)
        if (message.id === RUN_OUTCOME_MESSAGE_ID) {
          const failedIndex = steps.findIndex((s) => s.status === 'failed')
          const failed = failedIndex >= 0 ? steps[failedIndex] : null
          return buildRunOutcomeMessage(
            failed ? { stepIndex: failedIndex, stepLabel: failed.label } : null,
            journey.steps.length,
            locale,
          )
        }
        if (message.id === 'intro') return agentIntroForLocale(locale)
        return message
      }),
    )
  }, [locale, journey, steps])

  useEffect(() => {
    onHeaderChange?.({
      title: isComplete ? journeyName : t('newJourney'),
      subtitle: isRunning ? t('running') : isComplete ? undefined : t('starting'),
    })
  }, [isComplete, isRunning, journeyName, onHeaderChange, t])

  const {
    order: panelOrder,
    draggedId,
    dropTargetId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = usePanelOrder()

  const openPanel = useCallback((id: WorkspacePanelId) => {
    setOpenPanels((prev) => new Set(prev).add(id))
    setUserClosedPanels((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (id === 'monitoring') setEditMode(false)
  }, [])

  /** User clicked × — show as docked card until restored. */
  const closePanelByUser = useCallback((id: WorkspacePanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setUserClosedPanels((prev) => new Set(prev).add(id))
    if (id === 'browser' || id === 'monitoring') {
      setDetachedPanels((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  /** System hides panel during run / edit — not docked. */
  const hidePanel = useCallback((id: WorkspacePanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (id === 'browser' || id === 'monitoring') {
      setDetachedPanels((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [])

  const detachPanel = useCallback(
    (id: DetachablePanelId) => {
      openPanel(id)
      setDetachedPanels((prev) => new Set(prev).add(id))
    },
    [openPanel],
  )

  const dockPanel = useCallback((id: DetachablePanelId) => {
    setDetachedPanels((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const isPanelDetached = (id: WorkspacePanelId): id is DetachablePanelId =>
    (id === 'browser' || id === 'monitoring') && detachedPanels.has(id)

  const handlePanelDrop = useCallback(
    (event: DragEvent, targetId: string) => {
      const sourceId = (draggedId ?? event.dataTransfer.getData('text/plain')) as WorkspacePanelId
      handleDrop(event, targetId)
      if (sourceId && !openPanels.has(sourceId)) {
        openPanel(sourceId)
      }
    },
    [draggedId, handleDrop, openPanels, openPanel],
  )

  const toggleEdit = () => {
    setEditMode((on) => {
      if (!on) hidePanel('monitoring')
      return !on
    })
  }

  const stopRun = useCallback(() => {
    runIdRef.current += 1
    runAbortRef.current?.abort()
    runAbortRef.current = null
    setIsRunning(false)
    setSteps((prev) =>
      prev.map((s) =>
        s.status === 'running' ? { ...s, status: 'pending' as const } : s,
      ),
    )
    setMessages((prev) => [
      ...withoutTransientRunMessages(prev),
      {
        id: `agent-stop-${Date.now()}`,
        role: 'agent',
        content: runStoppedMessage(locale),
      },
    ])
  }, [locale])

  const handleApplyRecording = useCallback(
    (recorded: RecordedBrowserStep[]) => {
      const nextSteps = recordedStepsToJourneySteps(recorded)
      if (nextSteps.length === 0) return

      const title = recordingTitle(recorded, journeyName)
      const last = [...recorded].reverse().find((s) => s.url || s.href)
      const lastUrl = last?.href || last?.url || null

      setJourneyName(title)
      setSteps(nextSteps)
      setIsComplete(true)
      setIsRunning(false)
      setFixActionsResolved(false)
      setScheduleResolved(false)
      setEditMode(false)
      openPanel('steps')
      openPanel('browser')

      if (lastUrl) {
        setBrowserFrame({
          url: lastUrl,
          title,
          highlight: nextSteps[nextSteps.length - 1]?.label,
        })
      }

      onHeaderChange?.({
        title,
        subtitle: tf('extensionStepCount', { count: nextSteps.length }),
      })

      const stepsJson = nextSteps.map((s, index) => ({
        n: index + 1,
        action: s.action,
        label: s.label,
        href: s.href ?? null,
        targetHint: s.targetHint ?? null,
      }))
      const userPayload = [
        locale === 'fr'
          ? 'J’ai enregistré ce parcours dans Chrome (Take control). Voici le JSON des étapes — garde-les pour le Run :'
          : 'I recorded this journey in Chrome (Take control). Here is the steps JSON — keep them for Run:',
        '```json',
        JSON.stringify({ title, url: lastUrl, steps: stepsJson }, null, 2),
        '```',
      ].join('\n')

      const userMsg: ChatMessage = {
        id: `user-recording-${Date.now()}`,
        role: 'user',
        content: userPayload,
      }
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `agent-recording-${Date.now()}`,
          role: 'agent',
          content: tf('extensionImported', { count: nextSteps.length }),
        },
      ])

      // Hand the recording to the Discovery agent (iterate) while keeping imported steps as source of truth.
      chatAbortRef.current?.abort()
      const abort = new AbortController()
      chatAbortRef.current = abort
      setAgentTyping(true)
      setWorkStatus(null)
      void (async () => {
        try {
          const history = [...messages, userMsg]
          const ai = await requestDiscoveryAi({
            mode: 'iterate',
            userMessage: userPayload,
            messages: history,
            phase: 'workspace',
            preferredLanguage: locale,
            journeyName: title,
            currentSteps: nextSteps.map((s) => ({
              id: s.id,
              label: s.label,
              action: s.action,
            })),
            context: {
              seed: initialPrompt || title,
              url: lastUrl,
              answers: {},
              selectedProposalId: null,
              selectedProposal: null,
              pageSnapshot: null,
            },
            signal: abort.signal,
            onStatus: (status) => setWorkStatus(status),
          })
          if (ai.aborted || abort.signal.aborted) return
          if (ai.message?.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent-recording-ai-${Date.now()}`,
                role: 'agent',
                content: ai.message,
              },
            ])
          }
          // Do not replace nextSteps with ai.plan — recorded steps stay authoritative for Run.
        } finally {
          if (chatAbortRef.current === abort) chatAbortRef.current = null
          setAgentTyping(false)
          setWorkStatus(null)
        }
      })()
    },
    [
      journeyName,
      onHeaderChange,
      openPanel,
      tf,
      locale,
      messages,
      initialPrompt,
    ],
  )

  const runStepsWithPlaywright = useCallback(
    async (
      runId: number,
      stepsToRun: Array<Omit<JourneyStep, 'status'> | JourneyStep>,
      options?: { startIndex?: number; replaceSteps?: boolean },
    ): Promise<{ usedLive: boolean; failedStep: RunFailureInfo | null }> => {
      const startIndex = options?.startIndex ?? 0
      const slice = stepsToRun.slice(startIndex)
      if (slice.length === 0) return { usedLive: false, failedStep: null }

      if (options?.replaceSteps) {
        setSteps(
          stepsToRun.map((step, index) => ({
            ...step,
            status:
              index < startIndex
                ? ('done' as const)
                : index === startIndex
                  ? ('running' as const)
                  : ('pending' as const),
          })),
        )
      } else {
        setSteps(slice.map((step) => ({ ...step, status: 'pending' as const })))
      }

      const controller = new AbortController()
      runAbortRef.current = controller

      try {
        const result = await runLiveJourney({
          steps: slice,
          prompt: initialPrompt,
          signal: controller.signal,
          onFrame: (frame) => {
            if (runIdRef.current !== runId) return
            // Always replace the panel with the capture for the step just executed.
            setBrowserFrame(frame)
          },
          onEvent: (event) => {
            if (runIdRef.current !== runId) return
            if (event.type === 'step_start') {
              const absolute = startIndex + event.index
              // Drop the previous step's screenshot so the panel never lags behind
              // the step currently running (common after re-runs / agent fixes).
              setBrowserFrame({
                url: 'about:blank',
                title: event.label,
                highlight: event.label,
              })
              setSteps((prev) => {
                if (options?.replaceSteps) {
                  return prev.map((s, idx) =>
                    idx === absolute
                      ? { ...s, status: 'running' }
                      : idx < absolute && s.status !== 'failed'
                        ? { ...s, status: s.status === 'pending' ? 'done' : s.status }
                        : s,
                  )
                }
                const next = [...prev]
                while (next.length <= event.index) {
                  const template = slice[next.length]
                  if (!template) break
                  next.push({ ...template, status: 'pending' })
                }
                return next.map((s, idx) =>
                  idx === event.index ? { ...s, status: 'running' } : s,
                )
              })
            }
            if (event.type === 'step_done') {
              const absolute = startIndex + event.index
              setSteps((prev) =>
                prev.map((s, idx) =>
                  idx === (options?.replaceSteps ? absolute : event.index)
                    ? { ...s, status: 'done' }
                    : s,
                ),
              )
            }
            if (event.type === 'status') {
              // Keep agent quiet during live capture — browser panel is the signal.
            }
          },
        })

        if (runIdRef.current !== runId || controller.signal.aborted) {
          return { usedLive: true, failedStep: null }
        }

        if (result.mode === 'unavailable') {
          return { usedLive: false, failedStep: null }
        }

        if (typeof result.failedStepIndex === 'number') {
          const absolute = startIndex + result.failedStepIndex
          const failedStep: RunFailureInfo = {
            stepIndex: absolute,
            stepLabel: result.failedStepLabel || slice[result.failedStepIndex]?.label || 'Step',
          }
          lastFailedStepRef.current = failedStep
          setSteps((prev) => {
            const next = prev.map((s, idx) =>
              idx === absolute ? { ...s, status: 'failed' as const } : s,
            )
            if (!options?.replaceSteps) {
              const remaining = stepsToRun
                .slice(absolute + 1)
                .map((step) => ({ ...step, status: 'pending' as const }))
              return [...next, ...remaining.filter((r) => !next.some((n) => n.id === r.id))]
            }
            return next
          })
          return {
            usedLive: true,
            failedStep,
          }
        }

        return { usedLive: true, failedStep: null }
      } catch {
        return { usedLive: false, failedStep: null }
      } finally {
        if (runAbortRef.current === controller) {
          runAbortRef.current = null
        }
      }
    },
    [initialPrompt],
  )

  const runSimulatedSteps = useCallback(
    async (
      runId: number,
      journeySteps: Array<Omit<JourneyStep, 'status'>>,
      options?: { announceFallback?: boolean },
    ): Promise<RunFailureInfo | null> => {
      if (options?.announceFallback) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-fallback-${runId}`,
            role: 'agent',
            content: runFallbackMessage(locale),
          },
        ])
      }

      const failureIndex = pickRandomFailureIndex(journeySteps.length)
      let failedStep: RunFailureInfo | null = null

      for (let i = 0; i < journeySteps.length; i++) {
        const template = journeySteps[i]!
        setSteps((prev) => [...prev, { ...template, status: 'running' }])
        setBrowserFrame(journey.browserFrames[i] ?? null)

        await delay(STEP_DELAY)
        if (runIdRef.current !== runId) return null

        const failed = failureIndex === i
        const stepStatus = failed ? ('failed' as const) : ('done' as const)
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: stepStatus } : s)),
        )

        if (i === Math.min(2, journeySteps.length - 1) || failed) {
          setMessages((prev) => [
            ...prev,
            {
              id: failed ? `agent-fail-${i}` : 'agent-progress',
              role: 'agent',
              content: failed
                ? tf('stepFailedStopping', { n: i + 1, label: template.label })
                : tf('stepDone', { n: i + 1, label: template.label }),
            },
          ])
        }

        if (failed) {
          failedStep = { stepIndex: i, stepLabel: template.label }
          lastFailedStepRef.current = failedStep
          const remaining = journeySteps
            .slice(i + 1)
            .map((step) => ({ ...step, status: 'pending' as const }))
          if (remaining.length > 0) {
            setSteps((prev) => [...prev, ...remaining])
          }
          break
        }
      }

      return failedStep
    },
    [journey.browserFrames, locale],
  )

  const runSimulation = useCallback(async () => {
    const runId = ++runIdRef.current
    setIsRunning(true)
    hidePanel('monitoring')
    setEditMode(false)
    setSteps([])
    setBrowserFrame(null)

    // Discovery already carried the conversation — don't re-inject the prompt as a new user turn.
    const hasDiscoveryHistory = session.messages.length > 0
    if (!hasDiscoveryHistory) {
      const userMsg: ChatMessage = {
        id: 'user-1',
        role: 'user',
        content: initialPrompt,
      }
      setMessages((prev) => [...prev, userMsg])
    }

    await delay(TYPING_DELAY)
    if (runIdRef.current !== runId) return

    setMessages((prev) => [
      ...prev,
      {
        id: `agent-run-start-${runId}`,
        role: 'agent',
        content: runStartMessage(locale),
      },
    ])

    await delay(400)
    if (runIdRef.current !== runId) return

    const journeySteps = journey.steps
    const live = await runStepsWithPlaywright(runId, journeySteps)
    if (runIdRef.current !== runId) return

    let failedStep = live.failedStep
    if (!live.usedLive) {
      setSteps([])
      failedStep = await runSimulatedSteps(runId, journeySteps, { announceFallback: true })
    } else if (failedStep) {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-fail-${failedStep!.stepIndex}`,
          role: 'agent',
          content: tf('stepFailedStopping', { n: failedStep!.stepIndex + 1, label: failedStep!.stepLabel }),
        },
      ])
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-live-ok-${runId}`,
          role: 'agent',
          content: runLiveOkMessage(locale),
        },
      ])
    }

    if (runIdRef.current !== runId) return

    setIsRunning(false)
    setIsComplete(true)
    setEditMode(false)
    setFixActionsResolved(false)
    openPanel('monitoring')
    setMessages((prev) => applyPostRunMessages(prev, journey, failedStep, { addJourneyReady: true, locale }))
  }, [
    initialPrompt,
    journey,
    locale,
    openPanel,
    hidePanel,
    runStepsWithPlaywright,
    runSimulatedSteps,
    session.messages.length,
  ])

  const runContinueAfterFix = useCallback(
    async (startIndex: number, stepsSnapshot: JourneyStep[]) => {
      if (isRunningRef.current || stepsSnapshot.length === 0) return
      if (startIndex < 0 || startIndex >= stepsSnapshot.length) return

      const runId = ++runIdRef.current
      isRunningRef.current = true
      setEditMode(false)
      hidePanel('monitoring')
      setIsRunning(true)
      setBrowserFrame(null)
      setFixActionsResolved(true)

      const remaining = stepsSnapshot.length - startIndex
      setMessages((prev) => [
        ...withoutTransientRunMessages(prev),
        {
          id: `agent-run-resume-${runId}`,
          role: 'agent',
          content: tf('replayingSteps', { count: remaining }),
        },
      ])

      // Always resume with live Playwright so the browser panel stays synced
      // to real step screenshots (not mock wireframes).
      const live = await runStepsWithPlaywright(runId, stepsSnapshot, {
        startIndex,
        replaceSteps: true,
      })

      if (runIdRef.current !== runId) {
        fixContinueInFlightRef.current = false
        isRunningRef.current = false
        return
      }

      let failedStep = live.failedStep
      if (!live.usedLive) {
        // Runner unavailable — fall back to local simulation, still advancing
        // the panel step-by-step so UI state stays aligned with the timeline.
        for (let i = startIndex; i < stepsSnapshot.length; i++) {
          const step = stepsSnapshot[i]!
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)),
          )
          setBrowserFrame(getBrowserFrameForStep(step, i))
          await delay(STEP_DELAY)
          if (runIdRef.current !== runId) {
            fixContinueInFlightRef.current = false
            isRunningRef.current = false
            return
          }
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: 'done' } : s)),
          )
        }
        failedStep = null
      } else if (failedStep) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-fail-${failedStep!.stepIndex}`,
            role: 'agent',
            content: tf('stepFailedStopping', {
              n: failedStep!.stepIndex + 1,
              label: failedStep!.stepLabel,
            }),
          },
        ])
      }

      if (runIdRef.current !== runId) {
        fixContinueInFlightRef.current = false
        isRunningRef.current = false
        return
      }

      if (!failedStep) lastFailedStepRef.current = null
      fixContinueInFlightRef.current = false
      isRunningRef.current = false
      setIsRunning(false)
      setEditMode(false)
      setFixActionsResolved(!failedStep)
      openPanel('monitoring')
      setMessages((prev) => applyPostRunMessages(prev, journey, failedStep, { locale }))
    },
    [journey, locale, openPanel, hidePanel, runStepsWithPlaywright, tf],
  )

  const runReplay = useCallback(async () => {
    if (isRunning || steps.length === 0) return

    const runId = ++runIdRef.current
    const stepsToRun = steps

    setEditMode(false)
    hidePanel('monitoring')
    setIsRunning(true)
    setFixActionsResolved(false)
    setBrowserFrame(null)

    setMessages((prev) => [
      ...withoutTransientRunMessages(prev),
      {
        id: `agent-run-${runId}`,
        role: 'agent',
        content: tf('replayingSteps', { count: stepsToRun.length }),
      },
    ])

    const live = await runStepsWithPlaywright(runId, stepsToRun, { replaceSteps: true })
    if (runIdRef.current !== runId) return

    let failedStep = live.failedStep
    if (!live.usedLive) {
      setSteps(stepsToRun.map((s) => ({ ...s, status: 'pending' as const })))
      const failureIndex = pickRandomFailureIndex(stepsToRun.length)
      for (let i = 0; i < stepsToRun.length; i++) {
        const step = stepsToRun[i]!
        setSteps((prev) =>
          prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)),
        )
        setBrowserFrame(getBrowserFrameForStep(step, i))
        await delay(STEP_DELAY)
        if (runIdRef.current !== runId) return
        const failed = failureIndex === i
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: failed ? 'failed' : 'done' } : s,
          ),
        )
        if (failed) {
          failedStep = { stepIndex: i, stepLabel: step.label }
          lastFailedStepRef.current = failedStep
          break
        }
      }
    }

    if (runIdRef.current !== runId) return

    setIsRunning(false)
    setEditMode(false)
    openPanel('monitoring')
    setMessages((prev) => applyPostRunMessages(prev, journey, failedStep, { locale }))
  }, [isRunning, steps, journey, openPanel, hidePanel, runStepsWithPlaywright])

  const handleRunStop = useCallback(() => {
    if (isRunning) {
      stopRun()
    } else if (steps.length > 0) {
      void runReplay()
    }
  }, [isRunning, steps.length, stopRun, runReplay])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void runSimulation()
  }, [runSimulation])

  const handleAgentAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case 'fix-auto-continue': {
          if (fixActionsResolved || fixContinueInFlightRef.current || isRunningRef.current) return

          const fullSteps = ensureFullJourneySteps(steps, journey)
          let failIndex = fullSteps.findIndex((step) => step.status === 'failed')
          if (failIndex < 0 && lastFailedStepRef.current) {
            failIndex = lastFailedStepRef.current.stepIndex
          }
          if (failIndex < 0 || failIndex >= fullSteps.length) return

          fixContinueInFlightRef.current = true
          setFixActionsResolved(true)
          const { step: fixedStep, changeSummary } = applyAgentStepFix(fullSteps[failIndex]!, locale)
          const nextSteps = fullSteps.map((step, index) => {
            if (index === failIndex) return fixedStep
            if (index < failIndex) return { ...step, status: 'done' as const }
            return step.status === 'failed' ? { ...step, status: 'pending' as const } : step
          })

          lastFailedStepRef.current = null
          setSteps(nextSteps)
          setMessages((prev) => [
            ...withoutTransientRunMessages(prev),
            { id: `user-fix-auto-${Date.now()}`, role: 'user', content: t('fixAndContinue') },
            { id: `agent-fix-auto-${Date.now()}`, role: 'agent', content: changeSummary },
          ])
          void runContinueAfterFix(failIndex, nextSteps)
          break
        }

        case 'accept-schedule':
          if (scheduleResolved) return
          onAcceptSchedule()
          break

        case 'custom-schedule':
          if (scheduleResolved) return
          onCustomizeSchedule()
          break

        case 'skip-schedule':
          if (scheduleResolved) return
          setScheduleResolved(true)
          setMessages((prev) => [
            ...prev,
            { id: 'user-skip', role: 'user', content: t('scheduleSkip') },
            {
              id: 'agent-skip',
              role: 'agent',
              content: t('skipMonitoringHint'),
            },
          ])
          window.setTimeout(() => openPanel('monitoring'), 500)
          break
      }
    },
    [
      scheduleResolved,
      fixActionsResolved,
      steps,
      journey,
      locale,
      t,
      openPanel,
      runContinueAfterFix,
      onAcceptSchedule,
      onCustomizeSchedule,
    ],
  )

  const dockedPanels = panelOrder.filter(
    (id) =>
      userClosedPanels.has(id) && !(id === 'monitoring' && !isComplete),
  )
  const visiblePanels = panelOrder.filter((id) => openPanels.has(id))
  const inlinePanels = visiblePanels.filter((id) => !isPanelDetached(id))
  const detachedPanelIds = (['browser', 'monitoring'] as const).filter(
    (id) => detachedPanels.has(id) && openPanels.has(id),
  )

  const panelDragProps = (id: WorkspacePanelId) => ({
    isDragging: draggedId === id,
    isDropTarget: dropTargetId === id,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handlePanelDrop,
    onDragEnd: handleDragEnd,
  })

  const panelClose = (id: WorkspacePanelId) => () => closePanelByUser(id)

  const centerNarrowPanels = shouldCenterWorkspace(inlinePanels)

  const panelFlex = (id: WorkspacePanelId) =>
    getPanelFlexClass(id, inlinePanels, { stepsEditMode: editMode })

  const handleChatSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || agentTyping) return

      if (isRunning) {
        setMessages((prev) => [
          ...prev,
          { id: `user-${Date.now()}`, role: 'user', content: trimmed },
          {
            id: `agent-busy-${Date.now()}`,
            role: 'agent',
            content: t('stillRunningBusy'),
          },
        ])
        setInput('')
        return
      }

      const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setAgentTyping(true)
      setWorkStatus(null)

      chatAbortRef.current?.abort()
      const abort = new AbortController()
      chatAbortRef.current = abort

      const history = [...messages, userMsg]
      const seedUrl =
        session.siteUrl ||
        extractUrlFromText(initialPrompt) ||
        steps.map((s) => extractUrlFromText(`${s.label} ${s.action} ${s.target ?? ''}`)).find(Boolean) ||
        null

      try {
        const ai = await requestDiscoveryAi({
          mode: 'iterate',
          userMessage: trimmed,
          messages: history,
          phase: 'workspace',
          preferredLanguage: locale,
          journeyName: journey.name,
          currentSteps: steps.map((s) => ({ id: s.id, label: s.label, action: s.action })),
          context: {
            seed: initialPrompt || journey.name,
            url: seedUrl,
            answers: {},
            selectedProposalId: null,
            selectedProposal: null,
            pageSnapshot: null,
          },
          signal: abort.signal,
          onStatus: (status) => setWorkStatus(status),
        })

        if (ai.aborted || abort.signal.aborted) return

        const agentMsg: ChatMessage = {
          id: `agent-gemini-${Date.now()}`,
          role: 'agent',
          content: ai.message || (locale === 'fr' ? 'OK.' : 'OK.'),
        }

        if (ai.plan && (ai.readyForPlan || ai.plan.steps.length > 0)) {
          const nextSteps = planToJourneySteps(ai.plan, steps, seedUrl, locale)
          setSteps(nextSteps)
          setFixActionsResolved(false)
          setScheduleResolved(false)
          if (ai.plan.title) {
            setJourneyName(ai.plan.title)
            onHeaderChange?.({
              title: ai.plan.title,
              subtitle: isRunning ? t('running') : ai.plan.summary,
            })
          }
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== 'done-2' && m.id !== RUN_OUTCOME_MESSAGE_ID),
            agentMsg,
          ])
          return
        }

        // Full switch to another journey only when Gemini didn't return steps but user
        // clearly asked for a different site — fall back to remount via parent.
        const pastedUrl = extractUrlFromText(trimmed)
        const switchIntent =
          /\b(instead|rather|switch to|start over|new journey|autre parcours|plutôt|change de site)\b/i.test(
            trimmed,
          )
        if (pastedUrl && switchIntent && onRequestNewJourney) {
          setMessages((prev) => [...prev, agentMsg])
          window.setTimeout(() => onRequestNewJourney(trimmed), 400)
          return
        }

        setMessages((prev) => [...prev, agentMsg])
      } finally {
        if (chatAbortRef.current === abort) chatAbortRef.current = null
        setAgentTyping(false)
        setWorkStatus(null)
      }
    },
    [
      agentTyping,
      isRunning,
      locale,
      messages,
      steps,
      journey.name,
      initialPrompt,
      session.siteUrl,
      onHeaderChange,
      onRequestNewJourney,
      isRunning,
      t,
    ],
  )

  const renderMonitoringContent = () => (
    <MonitoringColumn
      embedded
      isUnsaved={!isMonitored}
      journeyName={journeyName}
      steps={steps}
      monitoring={journey.monitoring}
      onClose={panelClose('monitoring')}
      onSave={onSave}
    />
  )

  const recordingStartUrl =
    session.siteUrl ||
    extractUrlFromText(session.prompt) ||
    extractUrlFromText(initialPrompt) ||
    null

  const renderDetachedPanelContent = (id: DetachablePanelId) => {
    switch (id) {
      case 'browser':
        return (
          <BrowserPanel
            frame={browserFrame}
            isRunning={isRunning}
            embedded
            startUrl={recordingStartUrl}
            onApplyRecording={handleApplyRecording}
          />
        )
      case 'monitoring':
        return renderMonitoringContent()
    }
  }

  const renderPanel = (id: WorkspacePanelId) => {
    const dragProps = panelDragProps(id)

    switch (id) {
      case 'agent':
        return (
          <WorkspacePanel
            key={id}
            id={id}
            title={t('panelAgent')}
            flexClass={panelFlex(id)}
            onClose={panelClose('agent')}
            {...dragProps}
          >
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((msg) => (
                <AgentMessage
                  key={msg.id}
                  message={msg}
                  onActionClick={handleAgentAction}
                  hideActions={
                    (msg.id === 'done-2' && scheduleResolved) ||
                    (msg.id === RUN_OUTCOME_MESSAGE_ID &&
                      fixActionsResolved &&
                      Boolean(msg.actions?.some((action) => action.id === 'fix-auto-continue')))
                  }
                />
              ))}
              {(isRunning || agentTyping) && (
                <div className="px-2 py-0.5">
                  <AgentWorkStatus status={workStatus} compact />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <footer
              className="sticky z-10 shrink-0 border-t border-zinc-100 bg-[var(--color-surface)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[bottom] duration-300 ease-out dark:border-zinc-800"
              style={{ bottom: 'var(--keyboard-inset, 0px)' }}
            >
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleChatSubmit(input)
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => window.scrollTo(0, 0)}
                  placeholder={t('placeholderWorkspace')}
                  disabled={agentTyping}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-3 pr-10 text-base outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900"
                />
                <button
                  type="submit"
                  disabled={agentTyping || !input.trim()}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg bg-[#0071e3] text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowUp size={14} />
                </button>
              </form>
            </footer>
          </WorkspacePanel>
        )

      case 'steps':
        return (
          <WorkspacePanel
            key={id}
            id={id}
            title={tf('panelStepsCount', { count: steps.length })}
            flexClass={panelFlex(id)}
            hiddenBelowMd
            onClose={panelClose('steps')}
            actions={
              steps.length > 0 || isRunning ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleRunStop}
                    disabled={!isRunning && steps.length === 0}
                    title={isRunning ? t('stopRun') : t('runJourneyInBrowser')}
                    className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isRunning
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <Square size={12} fill="currentColor" />
                        {t('stop')}
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        {t('run')}
                      </>
                    )}
                  </button>
                  {isComplete && (
                    <button
                      type="button"
                      onClick={toggleEdit}
                      disabled={isRunning}
                      title={editMode ? t('doneEditing') : t('editSteps')}
                      className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        editMode
                          ? 'bg-[#0071e3] text-white'
                          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Pencil size={12} />
                      {editMode ? t('done') : t('edit')}
                    </button>
                  )}
                </div>
              ) : undefined
            }
            {...dragProps}
          >
            <JourneyTimeline
              steps={steps}
              compact
              editMode={editMode && !isRunning}
              onStepsChange={isRunning ? undefined : setSteps}
            />
          </WorkspacePanel>
        )

      case 'browser':
        return (
          <WorkspacePanel
            key={id}
            id={id}
            title={t('panelBrowser')}
            flexClass={panelFlex(id)}
            onClose={panelClose('browser')}
            onDetach={() => detachPanel('browser')}
            {...dragProps}
          >
            <BrowserPanel
              frame={browserFrame}
              isRunning={isRunning}
              embedded
              startUrl={recordingStartUrl}
              onApplyRecording={handleApplyRecording}
            />
          </WorkspacePanel>
        )

      case 'monitoring':
        return (
          <WorkspacePanel
            key={id}
            id={id}
            title={t('panelMonitoring')}
            flexClass={panelFlex(id)}
            onClose={panelClose('monitoring')}
            onDetach={() => detachPanel('monitoring')}
            {...dragProps}
          >
            {renderMonitoringContent()}
          </WorkspacePanel>
        )
    }
  }

  return (
    <div className="flex h-full flex-col">
      {dockedPanels.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3">
          {dockedPanels.map((id) => (
            <CollapsedWorkspacePanel
              key={id}
              id={id}
              title={id === 'steps' ? tf('panelStepsCount', { count: steps.length }) : panelLabel(id)}
              onRestore={() => openPanel(id)}
              {...panelDragProps(id)}
            />
          ))}
        </div>
      )}

      <div
        className={`flex min-h-0 flex-1 gap-4 overflow-x-auto p-4 ${
          centerNarrowPanels ? 'justify-center' : ''
        }`}
      >
        {inlinePanels.map((id) => renderPanel(id))}
      </div>

      <DetachedPanelsLayer
        detachedIds={detachedPanelIds}
        renderPanel={renderDetachedPanelContent}
        onDock={dockPanel}
      />

      {/* Mobile: steps strip */}
      {steps.length > 0 && (
        <div className="border-t border-zinc-200/80 px-3 py-2 dark:border-zinc-800 md:hidden">
          <div className="mb-1">
            <p className="text-xs font-medium text-zinc-400">
              {tf('stepsProgress', {
                done: steps.filter((s) => s.status === 'done').length,
                total: steps.length,
              })}
            </p>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`h-1.5 w-8 shrink-0 rounded-full ${
                  step.status === 'done'
                    ? 'bg-emerald-400'
                    : step.status === 'running'
                      ? 'bg-[#0071e3] animate-pulse-soft'
                      : step.status === 'failed'
                        ? 'bg-red-400'
                        : 'bg-zinc-200'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

export default NewJourney

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
