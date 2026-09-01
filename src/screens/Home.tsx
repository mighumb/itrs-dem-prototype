import { ArrowUp, Play } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import DiscoveryStack from '../components/DiscoveryStack'
import { AgentMessage } from '../components/GlobalAgent'
import AgentWorkStatus from '../components/AgentWorkStatus'
import RotatingWord from '../components/RotatingWord'
import { useLocale } from '../context/LocaleContext'
import { HOME_ROTATING_TARGETS } from '../i18n/messages'
import {
  answersIncludeSiteDecline,
  looksLikeSiteConfirmation,
  looksLikeSiteDecline,
  requestDiscoveryAi,
  summarizeStatedJourneyIntent,
  shouldSkipJourneyChooser,
  type DiscoveryAiResult,
} from '../lib/discoveryAi'
import { proposalHonorsStatedIntent } from '../../api/_lib/proposalIntentGuard'
import {
  appendPlanNotAppliedHint,
  classifyIterateWorkspacePlanIntent,
  planStepsForIterate,
  shouldBindPlanningAiPlan,
  wantsApplyPlanToPanel,
} from '../lib/discoveryChat'
import { formatQuestionnaireChatBlock, maskFreeformUserChatContent } from '../lib/sensitiveAnswers'
import { type JourneyLaunchSession, extractUrlFromText } from '../lib/journeyLaunch'
import {
  getHomeExamples,
  HOME_SAMPLE_LOGO_OPTICAL_BALANCE,
  type HomeJourneyExample,
} from '../mock/data'
import {
  createDiscoveryContext,
  isBareJourneyLaunch,
  isLocaleNoiseComplaint,
  messageWithAuthoritativePlan,
  sanitizeDiscoveryPlan,
  formatJourneyProposalsList,
  formatQuestionnairePrompt,
  wantsJourneyLaunch,
  wantsMissingRunButton,
  wantsPlanApproval,
  wantsPlanCorrection,
  type DiscoveryContext,
  type DiscoveryPhase,
  type DiscoveryPlan,
  type DiscoveryQuestion,
  type JourneyProposal,
} from '../mock/discovery'
import type { ChatMessage } from '../types'

interface HomeProps {
  userName?: string
  onStart: (session: JourneyLaunchSession) => void
  /** Notify parent when Discovery chat is in-session (header fade). */
  onDiscoverySessionChange?: (active: boolean) => void
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export default function Home({
  userName = 'there',
  onStart,
  onDiscoverySessionChange,
}: HomeProps) {
  const { t, locale } = useLocale()
  const [phase, setPhase] = useState<DiscoveryPhase>('idle')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [agentTyping, setAgentTyping] = useState(false)
  const [workStatus, setWorkStatus] = useState<string | null>(null)
  const [ctx, setCtx] = useState<DiscoveryContext | null>(null)
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [proposals, setProposals] = useState<JourneyProposal[]>([])
  const [plan, setPlan] = useState<DiscoveryPlan | null>(null)
  /** User confirmed the plan — Run/Lancer appears only after this. */
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const [configuring, setConfiguring] = useState(false)
  /** Floating-form chrome title — driven by the AI ask, not a fixed default. */
  const [formTitle, setFormTitle] = useState<string | null>(null)
  /**
   * True after brand_resolve asked "is this the site?" — until the user affirms or declines.
   * Decline must never enter propose mode / open journey chooser for that candidate.
   */
  const [siteConfirmPending, setSiteConfirmPending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const formDockRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /** Tab held — Tab+Enter inserts a newline (Enter alone sends). Desktop only. */
  const tabHeldRef = useRef(false)
  /** Matches Tailwind `md` — below this, Enter = newline and the Tab+Enter hint is hidden. */
  const [isMobileComposer, setIsMobileComposer] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages
  const planRef = useRef<DiscoveryPlan | null>(null)
  planRef.current = plan
  const planConfirmedRef = useRef(false)
  planConfirmedRef.current = planConfirmed
  const pendingAiPlanRef = useRef<DiscoveryPlan | null>(null)

  const rememberSnapshot = (ai: DiscoveryAiResult) => {
    const awaitingConfirm = ai.siteAnalysis?.reason === 'awaiting_user_confirmation'
    const awaitingSiteUrl = ai.siteAnalysis?.reason === 'awaiting_site_url'
    const siteUrlGate = awaitingConfirm || awaitingSiteUrl
    if (siteUrlGate) {
      setSiteConfirmPending(true)
    } else if (ai.siteAnalysis?.url || ai.pageSnapshot) {
      // Affirmed + explored (or explicit site turn) — confirm gate is done.
      setSiteConfirmPending(false)
    }

    // Keep candidate URL even before crawl (awaiting confirmation after brand/acronym resolve).
    if (!ai.pageSnapshot && !ai.siteAnalysis?.url && !awaitingSiteUrl) return
    setCtx((prev) => {
      const url = ai.siteAnalysis?.url ?? prev?.url ?? null
      const base = prev ?? createDiscoveryContext(url ?? ai.siteAnalysis?.title ?? 'site')
      return {
        ...base,
        url,
        pageSnapshot: siteUrlGate
          ? null
          : ai.pageSnapshot ?? base.pageSnapshot ?? null,
        seed:
          url && ai.siteAnalysis?.title
            ? `${ai.siteAnalysis.title} ${url}`
            : url ?? base.seed,
      }
    })
  }

  const inSession = phase !== 'idle'
  // Floating form is for user choice only — never keep it over the chat while Gemini works.
  const showStack =
    !agentTyping && (phase === 'questionnaire' || phase === 'proposals')
  const showRun = Boolean(plan && planConfirmed)

  useEffect(() => {
    onDiscoverySessionChange?.(inSession)
  }, [inSession, onDiscoverySessionChange])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobileComposer(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Keep the composer / Run / floating form reachable after long agent replies.
  // Document-scroll layout: without this, a tall plan leaves the input below the fold
  // and the user must scroll manually (avoidable friction).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const dock = formDockRef.current
      if (dock) {
        dock.scrollIntoView({ behavior: 'smooth', block: 'end' })
        return
      }
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 40)
    return () => window.clearTimeout(id)
  }, [messages, agentTyping, workStatus, showStack, showRun])

  const pushMessages = (...next: ChatMessage[]) => {
    setMessages((prev) => {
      const merged = [
        ...prev,
        ...next.map((m) =>
          m.role === 'user'
            ? { ...m, content: maskFreeformUserChatContent(m.content) }
            : m,
        ),
      ]
      messagesRef.current = merged
      return merged
    })
  }

  const beginRun = () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setAgentTyping(true)
    setWorkStatus(null)

    return {
      signal: controller.signal,
      onStatus: (text: string) => {
        if (abortRef.current === controller) {
          setWorkStatus(text)
        }
      },
      finish: () => {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setAgentTyping(false)
        setWorkStatus(null)
      },
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const withTyping = async (fn: (signal: AbortSignal, onStatus: (text: string) => void) => Promise<void>) => {
    const run = beginRun()
    try {
      await fn(run.signal, run.onStatus)
    } finally {
      run.finish()
    }
  }

  // Keep latest session fields for locale-switch without stale closures.
  const sessionRef = useRef({
    phase,
    proposals,
    questions,
    ctx,
    configuring,
    messages,
    agentTyping,
  })
  sessionRef.current = {
    phase,
    proposals,
    questions,
    ctx,
    configuring,
    messages,
    agentTyping,
  }
  const prevLocaleRef = useRef(locale)

  // Floating form content is Gemini-generated — refresh it when UI language changes.
  // Chat history (including plans) stays as written.
  useEffect(() => {
    if (prevLocaleRef.current === locale) return

    const session = sessionRef.current
    // Don't consume the locale change while the agent is busy — retry when idle.
    if (session.agentTyping) return

    const needsProposals = session.phase === 'proposals' && session.proposals.length > 0
    const needsQuestions = session.phase === 'questionnaire' && session.questions.length > 0
    if (!needsProposals && !needsQuestions) {
      prevLocaleRef.current = locale
      return
    }

    // Floating form content is model-generated — translate it when UI language changes.
    // Dedicated relocalize mode: no site crawl, no journey re-search, same ids.
    void withTyping(async (signal, onStatus) => {
      onStatus(t('agentTranslating'))
      const payload = {
        action: 'relocalize_ui',
        targetLanguage: locale,
        proposals: needsProposals ? session.proposals : undefined,
        questions: needsQuestions ? session.questions : undefined,
      }

      const ai = await requestDiscoveryAi({
        mode: 'relocalize',
        userMessage: JSON.stringify(payload),
        messages: [],
        phase: session.phase,
        context: null,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return

      let updated = false
      if (needsProposals && ai.proposals && ai.proposals.length > 0) {
        updated = true
        setProposals(ai.proposals)
        setFormTitle(
          ai.formTitle ||
            (session.phase === 'proposals' ? t('chooseJourney') : t('clarifyRequest')),
        )
      }
      if (needsQuestions && ai.questions && ai.questions.length > 0) {
        updated = true
        setQuestions(ai.questions)
        setFormTitle(
          ai.formTitle ||
            (session.configuring
              ? t('configureJourney')
              : session.phase === 'questionnaire' && session.ctx?.url
                ? t('confirmSite')
                : t('clarifyRequest')),
        )
      }

      if (updated) {
        prevLocaleRef.current = locale
        return
      }

      pushAgentReply(t('formRelocalizeFailed'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale + idle retry after typing
  }, [locale, agentTyping])

  const historyPlus = (...extra: ChatMessage[]) => [...messagesRef.current, ...extra]

  const pushAgentReply = (
    content: string,
    options?: { workTrace?: string[] | null },
  ) => {
    const body = content.trim() || t('agentEmptyReply')
    const trace = options?.workTrace
      ?.map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 6)
    pushMessages({
      id: uid('agent'),
      role: 'agent',
      content: body,
      workTrace: trace && trace.length > 0 ? trace : undefined,
    })
  }

  const presentPlan = (
    intro: string,
    nextPlan: DiscoveryPlan,
    options?: { workTrace?: string[] | null },
  ) => {
    const clean = sanitizeDiscoveryPlan(nextPlan)
    const withPlan = messageWithAuthoritativePlan(intro, clean)
    const body = `${withPlan}\n\n${t('planConfirmQuestion')}`.trim()
    pushAgentReply(body, options)
    pendingAiPlanRef.current = null
    setPlan(clean)
    setPlanConfirmed(false)
    setPhase('planning')
  }

  const approvePlanForRun = () => {
    setPlanConfirmed(true)
    pushAgentReply(t('planConfirmApproved'))
  }

  const wantsPlanAdjustments = (text: string, seedUrl?: string | null) => {
    const intent = classifyIterateWorkspacePlanIntent(text, seedUrl)
    return (
      intent.correctPlan ||
      intent.editSteps ||
      intent.newSiteOrJourney ||
      intent.localeNoiseFix ||
      wantsPlanCorrection(text)
    )
  }

  const shouldLaunchFromText = (text: string) =>
    isBareJourneyLaunch(text) ||
    wantsMissingRunButton(text) ||
    (wantsJourneyLaunch(text) && !isLocaleNoiseComplaint(text))

  const findProposalByText = (text: string): JourneyProposal | null => {
    const normalized = text.trim().toLowerCase()
    if (!normalized || proposals.length === 0) return null
    const exact = proposals.find((p) => p.title.trim().toLowerCase() === normalized)
    if (exact) return exact
    const numbered = normalized.match(/^(\d+)[.)]\s*(.*)$/)
    if (numbered) {
      const idx = Number.parseInt(numbered[1] ?? '', 10) - 1
      if (proposals[idx]) return proposals[idx]!
      const tail = (numbered[2] ?? '').trim().toLowerCase()
      if (tail) {
        const partial = proposals.find((p) => p.title.trim().toLowerCase().startsWith(tail))
        if (partial) return partial
      }
    }
    return (
      proposals.find(
        (p) =>
          normalized.includes(p.title.trim().toLowerCase()) ||
          p.title.trim().toLowerCase().includes(normalized),
      ) ?? null
    )
  }

  const tryLaunchFromText = (text: string, history: ChatMessage[]) => {
    if (wantsMissingRunButton(text) && planRef.current && !planConfirmedRef.current) {
      approvePlanForRun()
      return true
    }
    if (!shouldLaunchFromText(text)) return false
    if (launchSettledPlan(history)) return true
    if (pendingAiPlanRef.current) {
      const pending = sanitizeDiscoveryPlan(pendingAiPlanRef.current)
      pendingAiPlanRef.current = null
      setPlan(pending)
      setPhase('planning')
      return launchSettledPlan(history)
    }
    return false
  }

  const launchSettledPlan = (history: ChatMessage[]) => {
    const currentPlan = planRef.current
    if (!currentPlan) return false
    pendingAiPlanRef.current = null
    setProposals([])
    setQuestions([])
    setFormTitle(null)
    const clean = sanitizeDiscoveryPlan(currentPlan)
    setPlan(clean)
    setPlanConfirmed(true)
    setPhase('planning')
    onStart({
      prompt: clean.prompt,
      messages: history,
      plan: clean,
      siteUrl:
        ctx?.url ??
        clean.prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ??
        null,
      autoRun: true,
    })
    return true
  }

  const openProposalsStack = (
    nextProposals: JourneyProposal[],
    title: string | null,
    agentMessage: string,
    workTrace?: string[] | null,
  ) => {
    if (planRef.current) return false
    setProposals(nextProposals)
    setFormTitle(title)
    setPhase('proposals')
    const chooseTitle = title ?? t('chooseJourney')
    const listBlock = formatJourneyProposalsList(nextProposals, chooseTitle)
    const trimmed = agentMessage.trim()
    const body =
      trimmed && /^\s*1\.\s/m.test(trimmed) ? trimmed : `${trimmed}\n\n${listBlock}`.trim()
    pushAgentReply(body, { workTrace })
    return true
  }

  const openQuestionnaireStack = (
    nextQuestions: DiscoveryQuestion[],
    title: string | null,
    agentMessage: string,
    workTrace?: string[] | null,
  ) => {
    if (planRef.current) return false
    setQuestions(nextQuestions)
    setFormTitle(title)
    setQuestionIndex(0)
    setPhase('questionnaire')
    const promptBlock = formatQuestionnairePrompt(nextQuestions, 0, title ?? t('clarifyRequest'))
    const trimmed = agentMessage.trim()
    const body =
      trimmed && nextQuestions[0] && trimmed.includes(nextQuestions[0].prompt)
        ? trimmed
        : `${trimmed}\n\n${promptBlock}`.trim()
    pushAgentReply(body, { workTrace })
    return true
  }

  const enterPlanning = async (
    planSeed: DiscoveryPlan,
    userLine?: string,
    contextOverride?: DiscoveryContext | null,
  ) => {
    const userMsg = userLine
      ? ({ id: uid('user'), role: 'user', content: userLine } as ChatMessage)
      : null
    if (userMsg) {
      pushMessages(userMsg)
    }
    const planCtx = contextOverride ?? ctx
    if (contextOverride) setCtx(contextOverride)
    // Keep Run/Lancer hidden until Gemini returns a complete plan.
    setPlan(null)
    setPlanConfirmed(false)
    setPhase('conversation')
    await withTyping(async (signal, onStatus) => {
      const history = userMsg ? historyPlus(userMsg) : messagesRef.current
      const ai = await requestDiscoveryAi({
        mode: 'plan',
        userMessage: planSeed.prompt,
        messages: history,
        phase: 'planning',
        context: planCtx,
        selectedProposal: planCtx?.selectedProposal,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)

      // Nominal path: only show Run when Gemini produced a plan — never a local template.
      if (ai.plan) {
        presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
        return
      }

      setPhase('conversation')
      pushAgentReply(ai.message, { workTrace: ai.workTrace })
    })
  }

  const startQuestionnaire = async (seed: string) => {
    const nextCtx = createDiscoveryContext(seed)
    const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: seed }
    setCtx(nextCtx)
    setProposals([])
    setPlan(null)
    setPlanConfirmed(false)
    setQuestionIndex(0)
    setQuestions([])
    setFormTitle(null)
    setConfiguring(false)

    // Leave the idle landing immediately so the chat layout + work status appear
    // while the agent runs (mainstream LLM chat feel).
    pushMessages(userMsg)
    setPhase('conversation')

    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'bootstrap',
        userMessage: seed,
        messages: [userMsg],
        phase: 'conversation',
        context: nextCtx,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)

      // Complete plan → show steps + Run (precise free-typed seeds).
      if (ai.plan && (ai.readyForPlan || ai.plan.steps.length > 0)) {
        presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
        return
      }

      if (ai.proposals && ai.proposals.length > 0) {
        const stated = summarizeStatedJourneyIntent(seed)
        const autoSelect =
          shouldSkipJourneyChooser(seed) ||
          (stated &&
            ai.proposals.length === 1 &&
            proposalHonorsStatedIntent(ai.proposals[0]!, stated))
        if (autoSelect) {
          await handleSelectProposal(ai.proposals[0]!, { autoSelect: true, userMessage: seed })
          return
        }
        openProposalsStack(ai.proposals, ai.formTitle, ai.message, ai.workTrace)
        return
      }

      // Only show floating form when Gemini returned questions — never inject mocks.
      if (ai.questions && ai.questions.length > 0) {
        openQuestionnaireStack(ai.questions, ai.formTitle, ai.message, ai.workTrace)
        return
      }

      setPhase('conversation')
      pushAgentReply(ai.message, { workTrace: ai.workTrace })
    })
  }

  const openProposals = async (nextCtx: DiscoveryContext, history: ChatMessage[]) => {
    setCtx(nextCtx)
    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'propose',
        userMessage: nextCtx.seed,
        messages: history,
        phase: 'questionnaire',
        context: nextCtx,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)

      // Model sometimes returns a ready plan instead of chooser options — honor it.
      if (ai.plan && (ai.readyForPlan || ai.plan.steps.length > 0)) {
        presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
        return
      }

      // Only open the floating form when Gemini returned real proposals — no mock fallback.
      if (ai.proposals && ai.proposals.length > 0) {
        openProposalsStack(
          ai.proposals,
          ai.formTitle,
          ai.message || t('journeysSuggested'),
          ai.workTrace,
        )
        return
      }

      setPhase('conversation')
      pushAgentReply(ai.message, { workTrace: ai.workTrace })
    })
  }

  const allQuestionsAnswered = (nextCtx: DiscoveryContext) =>
    questions.length > 0 && questions.every((q) => Boolean(nextCtx.answers[q.id]))

  const commitQuestionnaireAndPropose = async (nextCtx: DiscoveryContext) => {
    // Snapshot before dismissing — React state clear must not wipe the answer summary.
    const answered = questions.filter((q) => Boolean(nextCtx.answers[q.id]))
    setQuestions([])
    setFormTitle(null)
    setPhase('conversation')

    if (configuring && nextCtx.selectedProposal) {
      const blocks = answered.map(
        (q) => `${t('answerQ')} : ${q.prompt}\n${t('answerR')} : ${nextCtx.answers[q.id]}`,
      )
      const summary = blocks.join('\n\n')
      const userMsg: ChatMessage = {
        id: uid('user'),
        role: 'user',
        content: summary || nextCtx.selectedProposal.title,
      }
      pushMessages(userMsg)
      setConfiguring(false)
      setCtx(nextCtx)
      const promptWithParams = [
        nextCtx.selectedProposal.prompt,
        answered.map((q) => `${q.prompt} → ${nextCtx.answers[q.id]}`).join('\n'),
        nextCtx.seed,
      ]
        .filter(Boolean)
        .join(' — ')
      await enterPlanning(
        {
          title: nextCtx.selectedProposal.title,
          summary: nextCtx.selectedProposal.description,
          steps: [{ label: nextCtx.selectedProposal.title, action: t('prepareJourney') }],
          prompt: promptWithParams,
        },
        undefined,
        nextCtx,
      )
      return
    }

    // Only post answers to the chat once the whole form is complete.
    const blocks = answered.map((q) =>
      formatQuestionnaireChatBlock(
        q.prompt,
        String(nextCtx.answers[q.id] ?? ''),
        locale,
        q.id,
      ),
    )
    const answerText = answered
      .map((q) => String(nextCtx.answers[q.id] ?? '').trim())
      .filter(Boolean)
      .join(' — ')
    const extra: ChatMessage[] = []
    if (blocks.length > 0) {
      const userMsg: ChatMessage = {
        id: uid('user'),
        role: 'user',
        content: blocks.join('\n\n'),
      }
      extra.push(userMsg)
      pushMessages(userMsg)
    }
    const history = historyPlus(...extra)

    const siteUrlAnswer = answered.find((q) => q.id === 'site-url')
    if (siteUrlAnswer) {
      const urlText = String(nextCtx.answers['site-url'] ?? '').trim()
      const url =
        extractUrlFromText(urlText) ??
        (/^(?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}/i.test(urlText)
          ? `https://${urlText.replace(/^https?:\/\//i, '')}`
          : urlText)
      const cleared: DiscoveryContext = {
        ...nextCtx,
        url,
        pageSnapshot: null,
        answers: {},
      }
      setSiteConfirmPending(false)
      setCtx(cleared)
      const msg = cleared.seed.trim()
        ? `${urlText}\n\n${t('initialNeedLabel')} ${cleared.seed}`
        : urlText
      await replyWithAiChat(msg, history, cleared)
      return
    }

    // Site-confirm form: decline / affirm are chat turns — never force propose mode.
    // (Forcing propose after "Non" was opening journeys on a rejected candidate.)
    if (siteConfirmPending && answersIncludeSiteDecline(nextCtx.answers)) {
      const cleared: DiscoveryContext = {
        ...nextCtx,
        url: null,
        pageSnapshot: null,
        seed: '',
        answers: {},
      }
      setSiteConfirmPending(false)
      setCtx(cleared)
      await replyWithAiChat(answerText || t('answerNo'), history, cleared)
      return
    }
    if (siteConfirmPending) {
      setSiteConfirmPending(false)
      setCtx(nextCtx)
      // Affirm → chat with URL so the server explores; keep original journey ask visible.
      const affirm =
        nextCtx.seed.trim().length > 0
          ? `${answerText || t('answerYes')}\n\n${t('initialNeedLabel')} ${nextCtx.seed}`
          : answerText || t('answerYes')
      await replyWithAiChat(affirm, history, nextCtx)
      return
    }

    // Form / journey params already collected for a known destination → build the plan.
    // (Previously we always opened “propose”, so the agent said “Voici le parcours” with no steps.)
    const hasSite =
      Boolean(nextCtx.url) ||
      /https?:\/\/[^\s<>"']+/i.test(nextCtx.seed) ||
      /(?:^|\s)(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/i.test(nextCtx.seed)
    if (hasSite && answered.length > 0) {
      setCtx(nextCtx)
      const title =
        nextCtx.selectedProposal?.title?.trim() ||
        (locale === 'fr' ? 'Parcours' : 'Journey')
      const promptWithParams = [
        nextCtx.seed,
        answered.map((q) => `${q.prompt} → ${nextCtx.answers[q.id]}`).join('\n'),
      ]
        .filter(Boolean)
        .join(' — ')
      await enterPlanning(
        {
          title,
          summary:
            nextCtx.selectedProposal?.description?.trim() ||
            (locale === 'fr'
              ? 'Parcours prêt à lancer avec les paramètres fournis.'
              : 'Journey ready to run with the provided parameters.'),
          steps: [{ label: title, action: t('prepareJourney') }],
          prompt: promptWithParams,
        },
        undefined,
        nextCtx,
      )
      return
    }

    await openProposals(nextCtx, history)
  }

  const saveQuestionnaireAnswer = async (questionId: string, option: string) => {
    if (!ctx) return
    const trimmed = option.trim()
    if (!trimmed) return

    const nextCtx = {
      ...ctx,
      answers: { ...ctx.answers, [questionId]: trimmed },
    }
    setCtx(nextCtx)

    // Keep answers local while the floating form is still open — chat updates on commit only.
    if (allQuestionsAnswered(nextCtx)) {
      await commitQuestionnaireAndPropose(nextCtx)
      return
    }

    const currentIdx = questions.findIndex((q) => q.id === questionId)
    const nextUnanswered = questions.findIndex(
      (q, i) => i > currentIdx && !nextCtx.answers[q.id],
    )
    if (nextUnanswered >= 0) {
      setQuestionIndex(nextUnanswered)
    } else if (currentIdx < questions.length - 1) {
      setQuestionIndex(currentIdx + 1)
    }
  }

  const handleSelectOption = async (questionId: string, option: string) => {
    await saveQuestionnaireAnswer(questionId, option)
  }

  const handleSkipQuestion = () => {
    if (questionIndex < questions.length - 1) {
      setQuestionIndex(questionIndex + 1)
      return
    }
    // Last question skipped: commit whatever was answered; only dismiss if nothing to keep.
    if (ctx && questions.some((q) => Boolean(ctx.answers[q.id]))) {
      void commitQuestionnaireAndPropose(ctx)
      return
    }
    handleCloseStack()
  }

  /** Close floating UI without treating it as a user message — agent stays silent. */
  const handleCloseStack = () => {
    // Dismiss must not leave a haunted confirm/configure context that biases the next turn.
    if (siteConfirmPending) {
      setSiteConfirmPending(false)
      setCtx((prev) =>
        prev
          ? {
              ...prev,
              url: null,
              pageSnapshot: null,
              seed: '',
              answers: {},
            }
          : prev,
      )
    } else if (configuring) {
      setCtx((prev) =>
        prev
          ? {
              ...prev,
              selectedProposalId: null,
              selectedProposal: null,
              answers: {},
            }
          : prev,
      )
    }
    setConfiguring(false)
    setQuestions([])
    setProposals([])
    setFormTitle(null)
    setPhase(planRef.current ? 'planning' : 'conversation')
  }

  const handleSelectProposal = async (
    proposal: JourneyProposal,
    options?: { autoSelect?: boolean; userMessage?: string },
  ) => {
    const nextCtx: DiscoveryContext = {
      ...(ctx ?? createDiscoveryContext(proposal.prompt)),
      selectedProposalId: proposal.id,
      selectedProposal: proposal,
      answers: {},
    }
    setCtx(nextCtx)
    setProposals([])
    setPlan(null)
    setPlanConfirmed(false)
    setFormTitle(null)
    setConfiguring(true)
    setQuestionIndex(0)
    setPhase('conversation')

    const configureMessage =
      options?.userMessage?.trim() ||
      (options?.autoSelect ? nextCtx.seed : '') ||
      proposal.prompt ||
      proposal.title

    let userMsg: ChatMessage | null = null
    if (!options?.autoSelect) {
      userMsg = {
        id: uid('user'),
        role: 'user',
        content: proposal.title,
      }
      pushMessages(userMsg)
    }

    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'configure',
        userMessage: configureMessage,
        messages: userMsg ? historyPlus(userMsg) : messagesRef.current,
        phase: 'proposals',
        context: nextCtx,
        selectedProposal: proposal,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) {
        setConfiguring(false)
        return
      }
      rememberSnapshot(ai)

      if (ai.plan && (ai.readyForPlan || ai.plan.steps.length > 0)) {
        setConfiguring(false)
        presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
        return
      }

      if (ai.questions && ai.questions.length > 0) {
        openQuestionnaireStack(ai.questions, ai.formTitle, ai.message, ai.workTrace)
        return
      }
      setConfiguring(false)
      setPhase('conversation')
      pushAgentReply(ai.message, { workTrace: ai.workTrace })
    })
  }

  const replyWithAiChat = async (
    text: string,
    history: ChatMessage[],
    contextOverride?: DiscoveryContext | null,
  ) => {
    const existingPlan = planRef.current
    let chatCtx = contextOverride !== undefined ? contextOverride : ctx
    const seedUrl =
      chatCtx?.url ??
      existingPlan?.prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ??
      null
    if (tryLaunchFromText(text, history)) return
    const pivot = classifyIterateWorkspacePlanIntent(text, seedUrl)

    if (!existingPlan || pivot.newSiteOrJourney) {
      if (pivot.newSiteOrJourney) {
        setPlan(null)
        setPlanConfirmed(false)
      }
      setProposals([])
      setQuestions([])
      setFormTitle(null)
      setPhase('conversation')
    }

    // Free-text decline while a brand_resolve confirm is open — drop the candidate
    // before the request so leftover URL/seed cannot revive proposals.
    if (
      contextOverride === undefined &&
      siteConfirmPending &&
      looksLikeSiteDecline(text)
    ) {
      chatCtx = ctx
        ? { ...ctx, url: null, pageSnapshot: null, seed: '', answers: {} }
        : null
      setSiteConfirmPending(false)
      setCtx(chatCtx)
    } else if (
      chatCtx &&
      summarizeStatedJourneyIntent(text) &&
      !looksLikeSiteConfirmation(text)
    ) {
      // User revised the journey in chat — refresh seed so later proposes follow the new ask.
      chatCtx = { ...chatCtx, seed: text.trim() }
      setCtx(chatCtx)
    }

    const useIterate = Boolean(existingPlan && !pivot.newSiteOrJourney)

    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: useIterate ? 'iterate' : 'chat',
        userMessage: text,
        messages: history,
        phase: useIterate ? 'planning' : 'conversation',
        context: chatCtx,
        preferredLanguage: locale,
        journeyName: existingPlan?.title ?? null,
        currentSteps: existingPlan ? planStepsForIterate(existingPlan) : null,
        hasSettledPlan: Boolean(existingPlan),
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)

      const modelReturnedPlan = Boolean(ai.plan && ai.plan.steps.length > 0)
      const bindModelPlan =
        modelReturnedPlan &&
        (shouldBindPlanningAiPlan(text, ai, seedUrl) || ai.readyForPlan)

      if (modelReturnedPlan && ai.plan) {
        if (bindModelPlan) {
          if (shouldLaunchFromText(text)) {
            const next = sanitizeDiscoveryPlan(ai.plan)
            setPlan(next)
            setPlanConfirmed(true)
            pushAgentReply(messageWithAuthoritativePlan(ai.message, next), {
              workTrace: ai.workTrace,
            })
            launchSettledPlan(history)
            return
          }
          presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
          return
        }
        pendingAiPlanRef.current = sanitizeDiscoveryPlan(ai.plan)
      }

      if (ai.proposals && ai.proposals.length > 0 && !planRef.current) {
        openProposalsStack(ai.proposals, ai.formTitle, ai.message, ai.workTrace)
        return
      }

      if (ai.questions && ai.questions.length > 0 && !planRef.current) {
        openQuestionnaireStack(ai.questions, ai.formTitle, ai.message, ai.workTrace)
        return
      }

      pushAgentReply(
        appendPlanNotAppliedHint(ai.message, text, bindModelPlan, locale),
        { workTrace: ai.workTrace },
      )
      if (existingPlan && !pivot.newSiteOrJourney) {
        setPlan(existingPlan)
        setPhase('planning')
      }
    })
  }

  const handleOther = async (text: string) => {
    if (phase === 'questionnaire' && questions[questionIndex]) {
      await saveQuestionnaireAnswer(questions[questionIndex].id, text)
      return
    }

    if (phase === 'proposals') {
      const history = messagesRef.current
      if (tryLaunchFromText(text, history)) return
      const matched = findProposalByText(text)
      if (matched) {
        await handleSelectProposal(matched)
        return
      }
      const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: text }
      pushMessages(userMsg)
      await replyWithAiChat(text, historyPlus(userMsg))
    }
  }

  const handleExample = async (example: HomeJourneyExample) => {
    setInput('')
    const title = example.journeyTitle[locale]
    const seed = example.seed[locale]
    const display = `${example.company} — ${title}`
    const proposal: JourneyProposal = {
      id: example.id,
      title,
      description: display,
      prompt: seed,
    }
    const nextCtx: DiscoveryContext = {
      ...createDiscoveryContext(seed),
      url: example.url[locale],
      selectedProposalId: proposal.id,
      selectedProposal: proposal,
      answers: {},
    }
    setCtx(nextCtx)
    setProposals([])
    setPlan(null)
    setPlanConfirmed(false)
    setConfiguring(true)
    setQuestionIndex(0)
    setQuestions([])
    setFormTitle(null)
    setPhase('conversation')

    const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: display }
    pushMessages(userMsg)

    // Journey type already chosen → configure (ask user params only if steps need them).
    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'configure',
        userMessage: seed,
        messages: [userMsg],
        phase: 'proposals',
        context: nextCtx,
        selectedProposal: proposal,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) {
        setConfiguring(false)
        return
      }
      rememberSnapshot(ai)

      if (ai.plan && (ai.readyForPlan || ai.plan.steps.length > 0)) {
        setConfiguring(false)
        presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
        return
      }

      if (ai.questions && ai.questions.length > 0) {
        openQuestionnaireStack(ai.questions, ai.formTitle, ai.message, ai.workTrace)
        return
      }

      setConfiguring(false)
      setPhase('conversation')
      pushAgentReply(ai.message, { workTrace: ai.workTrace })
    })
  }

  const handleSubmit = async (raw: string) => {
    const text = raw.trim()
    if (!text || agentTyping) return
    setInput('')

    if (phase === 'idle') {
      await startQuestionnaire(text)
      return
    }

    // Questionnaire: save in the form only; chat gets Q/R when the form is complete.
    if (phase === 'questionnaire' && questions[questionIndex]) {
      await saveQuestionnaireAnswer(questions[questionIndex].id, text)
      return
    }

    if (phase === 'proposals') {
      if (tryLaunchFromText(text, messagesRef.current)) return
      const matched = findProposalByText(text)
      if (matched) {
        await handleSelectProposal(matched)
        return
      }
      const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: text }
      pushMessages(userMsg)
      await replyWithAiChat(text, historyPlus(userMsg))
      return
    }

    const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: text }
    pushMessages(userMsg)
    const history = historyPlus(userMsg)

    if (tryLaunchFromText(text, history)) return

    if (wantsApplyPlanToPanel(text) && pendingAiPlanRef.current) {
      const planToApply = sanitizeDiscoveryPlan(pendingAiPlanRef.current)
      pendingAiPlanRef.current = null
      presentPlan(t('planAppliedFromPending'), planToApply)
      return
    }

    if (phase === 'planning') {
      const cleanCurrent = plan ? sanitizeDiscoveryPlan(plan) : null
      const seedUrl =
        ctx?.url ??
        cleanCurrent?.prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ??
        null

      if (
        cleanCurrent &&
        !planConfirmedRef.current &&
        wantsMissingRunButton(text)
      ) {
        approvePlanForRun()
        return
      }

      if (
        cleanCurrent &&
        !planConfirmedRef.current &&
        wantsPlanApproval(text) &&
        !wantsPlanAdjustments(text, seedUrl) &&
        !shouldLaunchFromText(text)
      ) {
        approvePlanForRun()
        return
      }

      // Launch / missing Lancer → run with the settled (sanitized) plan. Never re-dump dirty steps.
      if (
        cleanCurrent &&
        (isBareJourneyLaunch(text) ||
          wantsMissingRunButton(text) ||
          (wantsJourneyLaunch(text) && !isLocaleNoiseComplaint(text)))
      ) {
        setPlanConfirmed(true)
        setPlan(cleanCurrent)
        setPhase('planning')
        onStart({
          prompt: cleanCurrent.prompt,
          messages: history,
          plan: cleanCurrent,
          siteUrl: seedUrl,
          autoRun: true,
        })
        return
      }

      const launchIntent = wantsJourneyLaunch(text)
      const localeFix = isLocaleNoiseComplaint(text)
      const correcting =
        localeFix ||
        wantsPlanCorrection(text) ||
        wantsPlanAdjustments(text, seedUrl)
      const planSnapshot = cleanCurrent

      if (correcting && planSnapshot) {
        setPlanConfirmed(false)
      }

      // With a settled plan, stay in planning and iterate — never reopen proposals/forms on brainstorm.
      if (!planSnapshot && !launchIntent && !correcting) {
        setPhase('conversation')
      } else if (planSnapshot) {
        setPlan(planSnapshot)
        setPhase('planning')
      }

      await withTyping(async (signal, onStatus) => {
        const useIterate = Boolean(planSnapshot)
        const seedUrl =
          ctx?.url ??
          planSnapshot?.prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ??
          null
        const ai = await requestDiscoveryAi({
          mode: useIterate ? 'iterate' : 'chat',
          userMessage: text,
          messages: history,
          phase: 'planning',
          context: ctx,
          preferredLanguage: locale,
          journeyName: planSnapshot?.title ?? null,
          currentSteps: planSnapshot ? planStepsForIterate(planSnapshot) : null,
          hasSettledPlan: Boolean(planSnapshot),
          signal,
          onStatus,
        })
        if (ai.aborted) return
        rememberSnapshot(ai)

        const bindModelPlan =
          Boolean(ai.plan && ai.plan.steps.length > 0) &&
          (shouldBindPlanningAiPlan(text, ai, seedUrl) || ai.readyForPlan)

        if (bindModelPlan && ai.plan) {
          if (launchIntent) {
            setPlanConfirmed(true)
            setPlan(sanitizeDiscoveryPlan(ai.plan))
            setPhase('planning')
            onStart({
              prompt: ai.plan.prompt,
              messages: history,
              plan: sanitizeDiscoveryPlan(ai.plan),
              siteUrl: seedUrl,
              autoRun: true,
            })
            return
          }
          presentPlan(ai.message, ai.plan, { workTrace: ai.workTrace })
          return
        }

        if (ai.proposals && ai.proposals.length > 0 && !planSnapshot) {
          openProposalsStack(ai.proposals, ai.formTitle, ai.message, ai.workTrace)
          return
        }

        if (ai.questions && ai.questions.length > 0 && !planSnapshot) {
          openQuestionnaireStack(ai.questions, ai.formTitle, ai.message, ai.workTrace)
          return
        }

        if (ai.plan && ai.plan.steps.length > 0 && !bindModelPlan) {
          pendingAiPlanRef.current = sanitizeDiscoveryPlan(ai.plan)
        }

        if ((launchIntent || wantsMissingRunButton(text)) && planSnapshot) {
          setPlanConfirmed(true)
          setPlan(planSnapshot)
          setPhase('planning')
          onStart({
            prompt: planSnapshot.prompt,
            messages: history,
            plan: planSnapshot,
            siteUrl:
              ctx?.url ??
              planSnapshot.prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ??
              null,
            autoRun: true,
          })
          return
        }

        // Correction with no new plan object — keep sanitized snapshot + Lancer.
        if (correcting && planSnapshot) {
          const body = messageWithAuthoritativePlan(
            appendPlanNotAppliedHint(
              ai.message?.trim() || t('workspacePlanLocaleCleanIntro'),
              text,
              false,
              locale,
            ),
            planSnapshot,
          )
          pushAgentReply(body, { workTrace: ai.workTrace })
          setPlan(planSnapshot)
          setPhase('planning')
          return
        }

        pushAgentReply(
          appendPlanNotAppliedHint(ai.message, text, false, locale),
          { workTrace: ai.workTrace },
        )
        // Stay in planning with the snapshot if we still have one — never strand a plan without Lancer.
        if (planSnapshot) {
          setPlan(planSnapshot)
          setPhase('planning')
        }
      })
      return
    }

    // conversation phase — brainstorm; Run/Lancer only after a complete plan is shown
    await replyWithAiChat(text, history)
  }

  const handleRun = () => {
    if (!plan) return
    onStart({
      prompt: plan.prompt,
      messages,
      plan,
      siteUrl: ctx?.url ?? plan.prompt.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ?? null,
      autoRun: true,
    })
  }

  const inputPlaceholder =
    phase === 'idle'
      ? t('placeholderIdle')
      : phase === 'questionnaire' || phase === 'proposals'
        ? t('placeholderReply')
        : phase === 'planning'
        ? plan && !planConfirmed
          ? t('placeholderPlanReview')
          : t('placeholderPlanning')
        : t('placeholderBrainstorm')

  const insertNewlineAtCursor = (el: HTMLTextAreaElement) => {
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const next = `${el.value.slice(0, start)}\n${el.value.slice(end)}`
    setInput(next)
    requestAnimationFrame(() => {
      const pos = start + 1
      el.selectionStart = pos
      el.selectionEnd = pos
    })
  }

  /** Grow like Claude: text expands; scroll pane is inset from rounded corners. */
  const composerScrollRef = useRef<HTMLDivElement>(null)

  const resizeComposer = () => {
    const el = inputRef.current
    const scroller = composerScrollRef.current
    if (!el || !scroller) return
    el.style.height = '0px'
    const style = window.getComputedStyle(el)
    const lineHeight = Number.parseFloat(style.lineHeight) || 24
    const paddingY =
      (Number.parseFloat(style.paddingTop) || 0) +
      (Number.parseFloat(style.paddingBottom) || 0)
    const maxHeight = lineHeight * 8 + paddingY
    const contentHeight = Math.max(el.scrollHeight, lineHeight + paddingY)
    el.style.height = `${contentHeight}px`
    el.style.overflowY = 'hidden'
    scroller.style.maxHeight = `${maxHeight}px`
  }

  useLayoutEffect(() => {
    resizeComposer()
  }, [input])

  const composer = (
    <div className="relative">
      <form
        className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition-[border-color,box-shadow] focus-within:border-[#0071e3] focus-within:ring-4 focus-within:ring-[#0071e3]/10 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_4px_28px_rgba(0,0,0,0.45)] dark:focus-within:ring-[#0071e3]/20"
        onSubmit={(e) => {
          e.preventDefault()
          if (agentTyping) return
          void handleSubmit(input)
        }}
      >
        {/* Outer inset so the scrollbar clears the rounded corner (Claude-style). */}
        <div className="min-h-10 pt-2 pr-2 pl-1">
          <div
            ref={composerScrollRef}
            className="min-h-10 overflow-x-hidden overflow-y-auto overscroll-contain pl-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  // Keep focus so Tab+Enter can insert a newline (desktop).
                  e.preventDefault()
                  tabHeldRef.current = true
                  return
                }
                if (e.key !== 'Enter') return
                // Mobile soft keyboard: Enter = newline, send via the arrow button only.
                if (isMobileComposer) return
                if (tabHeldRef.current || e.shiftKey) {
                  e.preventDefault()
                  insertNewlineAtCursor(e.currentTarget)
                  return
                }
                e.preventDefault()
                if (agentTyping || !input.trim()) return
                void handleSubmit(input)
              }}
              onKeyUp={(e) => {
                if (e.key === 'Tab') tabHeldRef.current = false
              }}
              onBlur={() => {
                tabHeldRef.current = false
              }}
              placeholder={inputPlaceholder}
              disabled={agentTyping}
              readOnly={agentTyping}
              className="block min-h-10 w-full resize-none overflow-hidden border-0 bg-transparent py-1.5 pr-2 text-base leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
        </div>
        {/* Action row under the text — room for future attach / voice controls. */}
        <div className="flex shrink-0 items-center justify-end gap-1.5 px-2 pb-2 pt-1">
          {agentTyping ? (
            <button
              type="button"
              onClick={handleStop}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0071e3] text-white transition hover:bg-[#0077ed]"
              aria-label={t('stop')}
            >
              <span className="block h-3.5 w-3.5 rounded-[3px] bg-white" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0071e3] text-white transition hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('send')}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
      <p className="mt-1.5 hidden text-center text-[11px] text-zinc-400 md:block dark:text-zinc-500">
        {t('composerNewlineHint')}
      </p>
    </div>
  )

  if (!inSession) {
    // Fill the viewport below the fixed header so justify-center actually
    // centers (ChatGPT-like). min-h-full alone failed after document-scroll
    // unlock — the height chain no longer filled the screen on desktop.
    return (
      <div
        className="keyboard-lift flex flex-col items-center justify-center px-6 py-16"
        style={{
          minHeight:
            'calc(var(--app-height, 100dvh) - var(--app-header-height, 3.5rem))',
        }}
      >
        <div className="w-full max-w-2xl animate-fade-in">
          {userName && userName !== 'there' ? (
            <p className="mb-3 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {t('goodMorning')} {userName}
            </p>
          ) : null}
          <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl md:leading-snug">
            {/* Line 1: Which/Quel + blue word only — rest of the sentence on the next line */}
            <span className="flex flex-wrap items-baseline justify-center gap-x-1.5">
              <span>{t('homeTitleBefore')}</span>
              <RotatingWord words={HOME_ROTATING_TARGETS[locale]} />
            </span>
            <span className="mt-1 block text-pretty">{t('homeTitleAfter')}</span>
          </h1>

          {composer}

          <div className="mt-8">
            <p className="mb-3.5 text-center text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {t('sampleJourneys')}
            </p>
            {/* Mobile: keep the current 4-row list. Desktop (md+): 2×2 rectangles with larger logos. */}
            <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
              {getHomeExamples(locale).map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => void handleExample(example)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50 px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-white dark:border-zinc-700/50 dark:bg-zinc-900/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 md:min-h-[7.5rem] md:flex-col md:items-start md:gap-3 md:px-4 md:py-4"
                >
                  <span
                    className="relative flex h-7 w-7 shrink-0 items-center justify-start md:h-10 md:w-auto md:max-w-[var(--logo-max-w,7.5rem)]"
                    style={
                      HOME_SAMPLE_LOGO_OPTICAL_BALANCE && example.logoMaxWidthDesktop
                        ? ({
                            ['--logo-max-w' as string]: example.logoMaxWidthDesktop,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {/*
                      Desktop optical scale (md+). Mobile unchanged.
                      Rollback: set HOME_SAMPLE_LOGO_OPTICAL_BALANCE = false in mock/data.ts
                    */}
                    <img
                      src={example.logoSrc}
                      alt=""
                      className={`h-7 w-7 object-contain md:h-10 md:w-auto md:max-h-10 md:origin-left ${
                        HOME_SAMPLE_LOGO_OPTICAL_BALANCE
                          ? 'md:[transform:scale(var(--logo-scale,1))]'
                          : ''
                      } ${example.logoSrcDark ? 'dark:hidden' : ''}`}
                      style={
                        HOME_SAMPLE_LOGO_OPTICAL_BALANCE && example.logoScaleDesktop != null
                          ? ({
                              ['--logo-scale' as string]: String(example.logoScaleDesktop),
                            } as CSSProperties)
                          : undefined
                      }
                    />
                    {example.logoSrcDark ? (
                      <img
                        src={example.logoSrcDark}
                        alt=""
                        className={`hidden h-7 w-7 object-contain dark:block md:h-10 md:w-auto md:max-h-10 md:origin-left ${
                          HOME_SAMPLE_LOGO_OPTICAL_BALANCE
                            ? 'md:[transform:scale(var(--logo-scale,1))]'
                            : ''
                        }`}
                        style={
                          HOME_SAMPLE_LOGO_OPTICAL_BALANCE && example.logoScaleDesktop != null
                            ? ({
                                ['--logo-scale' as string]: String(example.logoScaleDesktop),
                              } as CSSProperties)
                            : undefined
                        }
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {example.company}
                    </span>
                    <span className="block text-sm leading-snug text-zinc-700 dark:text-zinc-200">
                      {example.journeyTitle[locale]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mx-auto flex w-full max-w-2xl flex-col px-6 pt-8"
      style={{
        minHeight: 'calc(var(--app-height, 100dvh) - var(--app-header-height, 3.5rem))',
      }}
    >
      {/* Document scroll (Amazon-style) so native browser pull-to-refresh can
          rubber-band the whole page — no nested overflow trap, no custom loader. */}
      <div className="mt-auto w-full space-y-4 pb-4">
        {messages.map((message) => (
          <AgentMessage key={message.id} message={message} hideActions />
        ))}
        {agentTyping && (
          <div className="px-1 pt-1">
            <AgentWorkStatus status={workStatus} />
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div
        ref={formDockRef}
        className="sticky z-10 flex w-full flex-col gap-2 bg-[var(--color-surface)] pt-2 transition-[bottom] duration-300 ease-out"
        style={{
          bottom: 'var(--keyboard-inset, 0px)',
          paddingBottom: 'var(--dock-pad-bottom, max(1rem, env(safe-area-inset-bottom, 0px)))',
        }}
      >
        {showStack && phase === 'questionnaire' && (
          <DiscoveryStack
            mode="questions"
            title={
              formTitle ??
              (configuring ? t('configureJourney') : t('clarifyRequest'))
            }
            questions={questions}
            questionIndex={questionIndex}
            answers={ctx?.answers}
            onQuestionIndexChange={setQuestionIndex}
            onSelectOption={(id, option) => void handleSelectOption(id, option)}
            onSkipQuestion={() => void handleSkipQuestion()}
            onClose={handleCloseStack}
            onSubmitOther={(text) => void handleOther(text)}
          />
        )}

        {showStack && phase === 'proposals' && (
          <DiscoveryStack
            mode="proposals"
            title={formTitle ?? t('chooseJourney')}
            proposals={proposals}
            onClose={handleCloseStack}
            onSelectProposal={(proposal) => void handleSelectProposal(proposal)}
            onSubmitOther={(text) => void handleOther(text)}
          />
        )}

        {showRun && (
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t('readyToRun')}
            </p>
            <button
              type="button"
              onClick={handleRun}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[#0071e3] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0077ed]"
            >
              <Play size={12} fill="currentColor" />
              {t('run')}
            </button>
          </div>
        )}

        {composer}
      </div>
    </div>
  )
}


