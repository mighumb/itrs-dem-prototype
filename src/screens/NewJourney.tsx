import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent } from 'react'
import { ArrowUp, Pencil, Play, Square } from 'lucide-react'
import BrowserPanel from '../components/BrowserPanel'
import CollapsedWorkspacePanel from '../components/CollapsedWorkspacePanel'
import { DetachedPanelsLayer, type DetachablePanelId } from '../components/DetachedPanelWindow'
import { AgentMessage } from '../components/GlobalAgent'
import JourneyTimeline from '../components/JourneyTimeline'
import MonitoringColumn from '../components/MonitoringColumn'
import WorkspacePanel from '../components/WorkspacePanel'
import {
  DEFAULT_OPEN_PANELS,
  getPanelFlexClass,
  PANEL_LABELS,
  shouldCenterWorkspace,
  usePanelOrder,
  type WorkspacePanelId,
} from '../hooks/usePanelOrder'
import {
  AGENT_INTRO,
  applyAgentStepFix,
  applyPostRunMessages,
  DEMO_PROMPT,
  ensureFullJourneySteps,
  getBrowserFrameForStep,
  pickRandomFailureIndex,
  resolveJourneyTemplate,
  RUN_OUTCOME_MESSAGE_ID,
  withoutTransientRunMessages,
  type RunFailureInfo,
} from '../mock/data'
import { handleAgentChatInput } from '../mock/agentChat'
import { runLiveJourney } from '../lib/journeyRunAi'
import type { BrowserFrame, ChatMessage, JourneySchedule, JourneyStep } from '../types'
import { scheduleSummary } from '../types'

export interface NewJourneyHandle {
  commitAcceptSchedule: () => void
  commitCustomizeSchedule: (schedule: JourneySchedule) => void
}

interface NewJourneyProps {
  initialPrompt: string
  isMonitored: boolean
  onHeaderChange?: (header: { title: string; subtitle?: string }) => void
  onSave: () => void
  onAcceptSchedule: () => void
  onCustomizeSchedule: () => void
  onRequestNewJourney?: (prompt: string) => void
}

const STEP_DELAY = 1400
const TYPING_DELAY = 600

const NewJourney = forwardRef<NewJourneyHandle, NewJourneyProps>(function NewJourney(
  {
    initialPrompt,
    isMonitored,
    onHeaderChange,
    onSave,
    onAcceptSchedule,
    onCustomizeSchedule,
    onRequestNewJourney,
  },
  ref,
) {
  const journey = useMemo(
    () => resolveJourneyTemplate(initialPrompt || DEMO_PROMPT),
    [initialPrompt],
  )
  const [messages, setMessages] = useState<ChatMessage[]>([AGENT_INTRO])
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
  const chatEndRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)
  const runIdRef = useRef(0)
  const scheduleResolvedRef = useRef(false)
  const runAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scheduleResolvedRef.current = scheduleResolved
  }, [scheduleResolved])

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
          content: 'Every 15 min, Paris + Frankfurt',
        },
        {
          id: 'agent-schedule',
          role: 'agent',
          content:
            'Perfect. Create an account to start monitoring on this schedule.',
        },
      ])
    },
    commitCustomizeSchedule: (schedule: JourneySchedule) => {
      if (scheduleResolvedRef.current) return
      scheduleResolvedRef.current = true
      setScheduleResolved(true)
      const summary = scheduleSummary(schedule)
      setMessages((prev) => [
        ...prev,
        { id: 'user-custom', role: 'user', content: summary },
        {
          id: 'agent-custom',
          role: 'agent',
          content: `Perfect — **${summary}**. Create an account to activate monitoring.`,
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

  useEffect(() => {
    onHeaderChange?.({
      title: isComplete ? journey.name : 'New journey',
      subtitle: isComplete ? undefined : isRunning ? 'Running…' : 'Starting…',
    })
  }, [isComplete, isRunning, journey.name, onHeaderChange])

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
        content: 'Run stopped.',
      },
    ])
  }, [])

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
          prompt: initialPrompt || DEMO_PROMPT,
          signal: controller.signal,
          onFrame: (frame) => {
            if (runIdRef.current !== runId) return
            setBrowserFrame(frame)
          },
          onEvent: (event) => {
            if (runIdRef.current !== runId) return
            if (event.type === 'step_start') {
              const absolute = startIndex + event.index
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
            failedStep: {
              stepIndex: absolute,
              stepLabel: result.failedStepLabel || slice[result.failedStepIndex]?.label || 'Step',
            },
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
            content:
              'Playwright runner unavailable — falling back to simulated browser frames for this run.',
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
                ? `Step ${i + 1} failed — **${template.label}**. Stopping here.`
                : `Step ${i + 1} done — ${template.label}`,
            },
          ])
        }

        if (failed) {
          failedStep = { stepIndex: i, stepLabel: template.label }
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
    [journey.browserFrames],
  )

  const runSimulation = useCallback(async () => {
    const runId = ++runIdRef.current
    setIsRunning(true)
    hidePanel('monitoring')
    setEditMode(false)
    setSteps([])
    setBrowserFrame(null)

    const userMsg: ChatMessage = {
      id: 'user-1',
      role: 'user',
      content: initialPrompt || DEMO_PROMPT,
    }
    setMessages((prev) => [...prev, userMsg])

    await delay(TYPING_DELAY)
    if (runIdRef.current !== runId) return

    setMessages((prev) => [
      ...prev,
      {
        id: 'agent-1',
        role: 'agent',
        content:
          "Got it. I'll run this journey in a real Playwright browser — watch the screenshots on the right.",
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
          content: `Step ${failedStep!.stepIndex + 1} failed — **${failedStep!.stepLabel}**. Stopping here.`,
        },
      ])
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `agent-live-ok-${runId}`,
          role: 'agent',
          content: 'Playwright run finished — screenshots above are real page captures.',
        },
      ])
    }

    if (runIdRef.current !== runId) return

    setIsRunning(false)
    setIsComplete(true)
    setEditMode(false)
    setFixActionsResolved(false)
    openPanel('monitoring')
    setMessages((prev) => applyPostRunMessages(prev, journey, failedStep, { addJourneyReady: true }))
  }, [
    initialPrompt,
    journey,
    openPanel,
    hidePanel,
    runStepsWithPlaywright,
    runSimulatedSteps,
  ])

  const runContinueAfterFix = useCallback(
    async (startIndex: number, stepsSnapshot: JourneyStep[]) => {
      if (isRunning || stepsSnapshot.length === 0) return

      const runId = ++runIdRef.current
      setEditMode(false)
      hidePanel('monitoring')
      setIsRunning(true)
      setFixActionsResolved(false)
      setBrowserFrame(null)

      const live = await runStepsWithPlaywright(runId, stepsSnapshot, {
        startIndex,
        replaceSteps: true,
      })
      if (runIdRef.current !== runId) return

      if (!live.usedLive) {
        for (let i = startIndex; i < stepsSnapshot.length; i++) {
          const step = stepsSnapshot[i]!
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)),
          )
          setBrowserFrame(getBrowserFrameForStep(step, i))
          await delay(STEP_DELAY)
          if (runIdRef.current !== runId) return
          setSteps((prev) =>
            prev.map((s, idx) => (idx === i ? { ...s, status: 'done' } : s)),
          )
        }
      }

      if (runIdRef.current !== runId) return

      setIsRunning(false)
      setEditMode(false)
      openPanel('monitoring')
      setMessages((prev) => applyPostRunMessages(prev, journey, live.failedStep))
    },
    [isRunning, journey, openPanel, hidePanel, runStepsWithPlaywright],
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
        content: `Replaying **${stepsToRun.length} steps** in Playwright — watch real screenshots sync with each action.`,
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
          break
        }
      }
    }

    if (runIdRef.current !== runId) return

    setIsRunning(false)
    setEditMode(false)
    openPanel('monitoring')
    setMessages((prev) => applyPostRunMessages(prev, journey, failedStep))
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
          const fullSteps = ensureFullJourneySteps(steps, journey)
          const failIndex = fullSteps.findIndex((step) => step.status === 'failed')
          if (failIndex < 0) return

          setFixActionsResolved(true)
          const { step: fixedStep, changeSummary } = applyAgentStepFix(fullSteps[failIndex])
          const nextSteps = fullSteps.map((step, index) =>
            index === failIndex ? fixedStep : step,
          )

          setSteps(nextSteps)
          setMessages((prev) => [
            ...withoutTransientRunMessages(prev),
            { id: 'user-fix-auto', role: 'user', content: 'Fix and continue' },
            { id: 'agent-fix-auto', role: 'agent', content: changeSummary },
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
            { id: 'user-skip', role: 'user', content: 'Skip for now' },
            {
              id: 'agent-skip',
              role: 'agent',
              content:
                'No problem. Open **Monitoring** from the panel bar anytime to see a preview.',
            },
          ])
          window.setTimeout(() => openPanel('monitoring'), 500)
          break
      }
    },
    [
      scheduleResolved,
      steps,
      journey,
      hidePanel,
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

      setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: trimmed }])
      setInput('')
      setAgentTyping(true)

      await delay(TYPING_DELAY)

      const outcome = handleAgentChatInput(trimmed, {
        journey,
        steps,
        isComplete,
        isRunning,
      })

      setAgentTyping(false)

      if (outcome.kind === 'new_journey') {
        setMessages((prev) => [...prev, outcome.message])
        window.setTimeout(() => onRequestNewJourney?.(outcome.prompt), 400)
        return
      }

      if (outcome.kind === 'update_steps') {
        setSteps(outcome.steps)
        setFixActionsResolved(false)
        setScheduleResolved(false)
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== 'done-2' && m.id !== RUN_OUTCOME_MESSAGE_ID),
          outcome.message,
        ])
        return
      }

      setMessages((prev) => [...prev, outcome.message])
    },
    [
      agentTyping,
      journey,
      steps,
      isComplete,
      isRunning,
      onRequestNewJourney,
    ],
  )

  const renderMonitoringContent = () => (
    <MonitoringColumn
      embedded
      isUnsaved={!isMonitored}
      journeyName={journey.name}
      steps={steps}
      monitoring={journey.monitoring}
      onClose={panelClose('monitoring')}
      onSave={onSave}
    />
  )

  const renderDetachedPanelContent = (id: DetachablePanelId) => {
    switch (id) {
      case 'browser':
        return <BrowserPanel frame={browserFrame} isRunning={isRunning} embedded />
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
            title="Agent"
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
                <div className="flex gap-1 px-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 [animation-delay:300ms]" />
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <footer className="shrink-0 border-t border-zinc-100 p-3 dark:border-zinc-800">
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
                  placeholder="Ask or refine…"
                  disabled={agentTyping}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-3 pr-10 text-sm outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900"
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
            title={`Steps (${steps.length})`}
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
                    title={isRunning ? 'Stop run' : 'Run journey in browser'}
                    className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      isRunning
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <Square size={12} fill="currentColor" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        Run
                      </>
                    )}
                  </button>
                  {isComplete && (
                    <button
                      type="button"
                      onClick={toggleEdit}
                      disabled={isRunning}
                      title={editMode ? 'Done editing' : 'Edit steps'}
                      className={`flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        editMode
                          ? 'bg-[#0071e3] text-white'
                          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Pencil size={12} />
                      {editMode ? 'Done' : 'Edit'}
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
            title="Browser"
            flexClass={panelFlex(id)}
            onClose={panelClose('browser')}
            onDetach={() => detachPanel('browser')}
            {...dragProps}
          >
            <BrowserPanel frame={browserFrame} isRunning={isRunning} embedded />
          </WorkspacePanel>
        )

      case 'monitoring':
        return (
          <WorkspacePanel
            key={id}
            id={id}
            title="Monitoring"
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
              title={id === 'steps' ? `Steps (${steps.length})` : PANEL_LABELS[id]}
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
              {steps.filter((s) => s.status === 'done').length} / {steps.length} steps
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
