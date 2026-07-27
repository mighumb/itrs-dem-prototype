import { ArrowUp, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import DiscoveryStack from '../components/DiscoveryStack'
import { AgentMessage } from '../components/GlobalAgent'
import AgentWorkStatus from '../components/AgentWorkStatus'
import RotatingWord from '../components/RotatingWord'
import { useLocale } from '../context/LocaleContext'
import { HOME_ROTATING_TARGETS } from '../i18n/messages'
import {
  answersIncludeSiteDecline,
  looksLikeSiteDecline,
  requestDiscoveryAi,
  type DiscoveryAiResult,
} from '../lib/discoveryAi'
import type { JourneyLaunchSession } from '../lib/journeyLaunch'
import { getHomeExamples, type HomeJourneyExample } from '../mock/data'
import {
  createDiscoveryContext,
  formatPlanMessage,
  hasExploitableContext,
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
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export default function Home({ userName = 'there', onStart }: HomeProps) {
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
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const rememberSnapshot = (ai: DiscoveryAiResult) => {
    const awaitingConfirm = ai.siteAnalysis?.reason === 'awaiting_user_confirmation'
    if (awaitingConfirm) {
      setSiteConfirmPending(true)
    } else if (ai.siteAnalysis?.url || ai.pageSnapshot) {
      // Affirmed + explored (or explicit site turn) — confirm gate is done.
      setSiteConfirmPending(false)
    }

    // Keep candidate URL even before crawl (awaiting confirmation after brand/acronym resolve).
    if (!ai.pageSnapshot && !ai.siteAnalysis?.url) return
    setCtx((prev) => {
      const url = ai.siteAnalysis?.url ?? prev?.url ?? null
      const base = prev ?? createDiscoveryContext(url ?? ai.siteAnalysis?.title ?? 'site')
      return {
        ...base,
        url,
        pageSnapshot: awaitingConfirm
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
  const showRun = phase === 'planning' && Boolean(plan)

  // Smart scroll: when a floating form appears, bring the dock into view
  // (document scroll). Otherwise follow the latest message.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (showStack || showRun) {
        formDockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
        return
      }
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, showStack || showRun ? 60 : 0)
    return () => window.clearTimeout(id)
  }, [messages, agentTyping, workStatus, showStack, showRun, proposals, questions])

  const pushMessages = (...next: ChatMessage[]) => {
    setMessages((prev) => {
      const merged = [...prev, ...next]
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
    prevLocaleRef.current = locale

    const needsProposals = session.phase === 'proposals' && session.proposals.length > 0
    const needsQuestions = session.phase === 'questionnaire' && session.questions.length > 0
    if (!needsProposals && !needsQuestions) return

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

      if (needsProposals && ai.proposals && ai.proposals.length > 0) {
        setProposals(ai.proposals)
        setFormTitle(
          ai.formTitle ||
            (session.phase === 'proposals' ? t('chooseJourney') : t('clarifyRequest')),
        )
      }
      if (needsQuestions && ai.questions && ai.questions.length > 0) {
        // Preserve answers keyed by id when ids stay stable.
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
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale + idle retry after typing
  }, [locale, agentTyping])

  const historyPlus = (...extra: ChatMessage[]) => [...messagesRef.current, ...extra]

  const pushAgentReply = (content: string) => {
    if (!content.trim()) return
    pushMessages({
      id: uid('agent'),
      role: 'agent',
      content,
    })
  }

  const enterPlanning = async (planSeed: DiscoveryPlan, userLine?: string) => {
    const userMsg = userLine
      ? ({ id: uid('user'), role: 'user', content: userLine } as ChatMessage)
      : null
    if (userMsg) {
      pushMessages(userMsg)
    }
    // Keep Run/Lancer hidden until Gemini returns a complete plan.
    setPlan(null)
    setPhase('conversation')
    await withTyping(async (signal, onStatus) => {
      const history = userMsg ? historyPlus(userMsg) : messagesRef.current
      const ai = await requestDiscoveryAi({
        mode: 'plan',
        userMessage: planSeed.prompt,
        messages: history,
        phase: 'planning',
        context: ctx,
        selectedProposal: ctx?.selectedProposal,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)

      // Nominal path: only show Run when Gemini produced a plan — never a local template.
      if (ai.plan) {
        const formatted = formatPlanMessage(ai.plan)
        const content =
          ai.message.includes('1.') || ai.message.includes('1)')
            ? ai.message
            : ai.message
              ? `${ai.message}\n\n${formatted}`
              : formatted
        pushAgentReply(content)
        setPlan(ai.plan)
        setPhase('planning')
        return
      }

      setPhase('conversation')
      pushAgentReply(ai.message)
    })
  }

  const startQuestionnaire = async (seed: string) => {
    const nextCtx = createDiscoveryContext(seed)
    const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: seed }
    setCtx(nextCtx)
    setProposals([])
    setPlan(null)
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
        const formatted = formatPlanMessage(ai.plan)
        const content =
          ai.message.includes('1.') || ai.message.includes('1)')
            ? ai.message
            : ai.message
              ? `${ai.message}\n\n${formatted}`
              : formatted
        pushAgentReply(content)
        setPlan(ai.plan)
        setPhase('planning')
        return
      }

      if (ai.proposals && ai.proposals.length > 0) {
        setProposals(ai.proposals)
        setFormTitle(ai.formTitle)
        setPhase('proposals')
        pushAgentReply(ai.message)
        return
      }

      // Only show floating form when Gemini returned questions — never inject mocks.
      if (ai.questions && ai.questions.length > 0) {
        setQuestions(ai.questions)
        setFormTitle(ai.formTitle)
        setQuestionIndex(0)
        setPhase('questionnaire')
        pushAgentReply(ai.message)
        return
      }

      setPhase('conversation')
      pushAgentReply(ai.message)
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

      // Only open the floating form when Gemini returned real proposals — no mock fallback.
      if (ai.proposals && ai.proposals.length > 0) {
        setProposals(ai.proposals)
        setFormTitle(ai.formTitle)
        setPhase('proposals')
        pushAgentReply(ai.message || t('journeysSuggested'))
        return
      }

      setPhase('conversation')
      pushAgentReply(ai.message)
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
      )
      return
    }

    // Only post answers to the chat once the whole form is complete.
    const blocks = answered.map(
      (q) => `${t('answerQ')} : ${q.prompt}\n${t('answerR')} : ${nextCtx.answers[q.id]}`,
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
      await replyWithAiChat(answerText || 'Non', history, cleared)
      return
    }
    if (siteConfirmPending) {
      setSiteConfirmPending(false)
      setCtx(nextCtx)
      // Affirm → chat with URL so the server explores, then may return proposals.
      await replyWithAiChat(answerText || 'Oui', history, nextCtx)
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
    setPhase('conversation')
  }

  const handleSelectProposal = async (proposal: JourneyProposal) => {
    const nextCtx: DiscoveryContext = {
      ...(ctx ?? createDiscoveryContext(proposal.prompt)),
      selectedProposalId: proposal.id,
      selectedProposal: proposal,
      answers: {},
    }
    setCtx(nextCtx)
    setProposals([])
    setPlan(null)
    setFormTitle(null)
    setConfiguring(true)
    setQuestionIndex(0)
    setPhase('conversation')

    const userMsg: ChatMessage = {
      id: uid('user'),
      role: 'user',
      content: proposal.title,
    }
    pushMessages(userMsg)

    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'configure',
        userMessage: proposal.title,
        messages: historyPlus(userMsg),
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
        const formatted = formatPlanMessage(ai.plan)
        const content =
          ai.message.includes('1.') || ai.message.includes('1)')
            ? ai.message
            : ai.message
              ? `${ai.message}\n\n${formatted}`
              : formatted
        pushAgentReply(content)
        setPlan(ai.plan)
        setPhase('planning')
        return
      }

      if (ai.questions && ai.questions.length > 0) {
        setQuestions(ai.questions)
        setFormTitle(ai.formTitle)
        setQuestionIndex(0)
        setPhase('questionnaire')
        pushAgentReply(ai.message)
        return
      }
      setConfiguring(false)
      setPhase('conversation')
      pushAgentReply(ai.message)
    })
  }

  const replyWithAiChat = async (
    text: string,
    history: ChatMessage[],
    contextOverride?: DiscoveryContext | null,
  ) => {
    // Iterating away from a settled plan hides Run/Lancer until a full plan is shown again.
    setPlan(null)
    setProposals([])
    setQuestions([])
    setFormTitle(null)
    setPhase('conversation')

    // Free-text decline while a brand_resolve confirm is open — drop the candidate
    // before the request so leftover URL/seed cannot revive proposals.
    let chatCtx = contextOverride !== undefined ? contextOverride : ctx
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
    }

    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'chat',
        userMessage: text,
        messages: history,
        phase: 'conversation',
        context: chatCtx,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)

      if (ai.readyForPlan && ai.plan) {
        const formatted = formatPlanMessage(ai.plan)
        const content =
          ai.message.includes('1.') || ai.message.includes('1)')
            ? ai.message
            : `${ai.message}\n\n${formatted}`
        pushAgentReply(content)
        setPlan(ai.plan)
        setPhase('planning')
        return
      }

      if (ai.proposals && ai.proposals.length > 0) {
        setProposals(ai.proposals)
        setFormTitle(ai.formTitle)
        setPhase('proposals')
        pushAgentReply(ai.message)
        return
      }

      if (ai.questions && ai.questions.length > 0) {
        setQuestions(ai.questions)
        setFormTitle(ai.formTitle)
        setQuestionIndex(0)
        setPhase('questionnaire')
        pushAgentReply(ai.message)
        return
      }

      pushAgentReply(ai.message)
    })
  }

  const handleOther = async (text: string) => {
    if (phase === 'questionnaire' && questions[questionIndex]) {
      await saveQuestionnaireAnswer(questions[questionIndex].id, text)
      return
    }

    if (phase === 'proposals') {
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
      url: example.url,
      selectedProposalId: proposal.id,
      selectedProposal: proposal,
      answers: {},
    }
    setCtx(nextCtx)
    setProposals([])
    setPlan(null)
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
        const formatted = formatPlanMessage(ai.plan)
        const content =
          ai.message.includes('1.') || ai.message.includes('1)')
            ? ai.message
            : ai.message
              ? `${ai.message}\n\n${formatted}`
              : formatted
        pushAgentReply(content)
        setPlan(ai.plan)
        setPhase('planning')
        return
      }

      if (ai.questions && ai.questions.length > 0) {
        setQuestions(ai.questions)
        setFormTitle(ai.formTitle)
        setQuestionIndex(0)
        setPhase('questionnaire')
        pushAgentReply(ai.message)
        return
      }

      setConfiguring(false)
      setPhase('conversation')
      pushAgentReply(ai.message)
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
      const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: text }
      pushMessages(userMsg)
      await replyWithAiChat(text, historyPlus(userMsg))
      return
    }

    const userMsg: ChatMessage = { id: uid('user'), role: 'user', content: text }
    pushMessages(userMsg)
    const history = historyPlus(userMsg)

    if (phase === 'planning') {
      // Any new user turn while a plan is shown = iteration → hide Run/Lancer immediately.
      setPlan(null)
      setPhase('conversation')
      await withTyping(async (signal, onStatus) => {
        const ai = await requestDiscoveryAi({
          mode: 'chat',
          userMessage: text,
          messages: history,
          phase: 'planning',
          context: ctx,
          preferredLanguage: locale,
        signal,
        onStatus,
        })
        if (ai.aborted) return
        rememberSnapshot(ai)
  
        if (ai.readyForPlan && ai.plan) {
          const body =
            ai.message.includes('1.') || ai.message.includes('1)')
              ? ai.message
              : `${ai.message}\n\n${formatPlanMessage(ai.plan)}`
          pushAgentReply(body)
          setPlan(ai.plan)
          setPhase('planning')
          return
        }

        if (ai.proposals && ai.proposals.length > 0) {
          setProposals(ai.proposals)
          setFormTitle(ai.formTitle)
          setPhase('proposals')
          pushAgentReply(ai.message)
          return
        }

        if (ai.questions && ai.questions.length > 0) {
          setQuestions(ai.questions)
          setFormTitle(ai.formTitle)
          setQuestionIndex(0)
          setPhase('questionnaire')
          pushAgentReply(ai.message)
          return
        }

        // Iteration without a new complete plan: keep chatting, Run stays hidden.
        if (ai.plan && hasExploitableContext(text, ctx)) {
          const nextPlan = ai.plan
          const body =
            ai.message.includes('1.') || ai.message.includes('1)')
              ? ai.message
              : `${ai.message}\n\n${formatPlanMessage(nextPlan)}`
          pushAgentReply(body)
          setPlan(nextPlan)
          setPhase('planning')
          return
        }

        pushAgentReply(ai.message)
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
    })
  }

  const inputPlaceholder =
    phase === 'idle'
      ? t('placeholderIdle')
      : phase === 'questionnaire' || phase === 'proposals'
        ? t('placeholderReply')
        : phase === 'planning'
          ? t('placeholderPlanning')
          : t('placeholderBrainstorm')

  const composer = (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        if (agentTyping) return
        void handleSubmit(input)
      }}
    >
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => {
          // Stop iOS from panning the focused field mid-viewport; sticky
          // bottom + --keyboard-inset already pins the dock above the keyboard.
          window.scrollTo(0, 0)
        }}
        placeholder={inputPlaceholder}
        disabled={agentTyping}
        readOnly={agentTyping}
        className="w-full rounded-2xl border border-zinc-200/80 bg-white py-4 pl-5 pr-14 text-base outline-none shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition placeholder:text-zinc-400 focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[0_4px_28px_rgba(0,0,0,0.45)] dark:placeholder:text-zinc-500 dark:focus:ring-[#0071e3]/20"
      />
      {agentTyping ? (
        <button
          type="button"
          onClick={handleStop}
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-[#0071e3] text-white transition hover:bg-[#0077ed]"
          aria-label={t('stop')}
        >
          <span className="block h-3.5 w-3.5 rounded-[3px] bg-white" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-[#0071e3] text-white transition hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t('send')}
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
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
            <p className="mb-3 text-center text-xs text-zinc-400">{t('sampleJourneys')}</p>
            <div className="space-y-2">
              {getHomeExamples(locale).map((example) => (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => void handleExample(example)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50 px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-white dark:border-zinc-700/50 dark:bg-zinc-900/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  <img
                    src={example.logoSrc}
                    alt=""
                    className="h-7 w-7 shrink-0 object-contain"
                  />
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
        onFocusCapture={() => {
          // iOS scrolls focused inputs into the upper visual viewport, which
          // fights sticky+keyboard-inset and leaves a large gap above the keyboard.
          window.scrollTo(0, 0)
          requestAnimationFrame(() => window.scrollTo(0, 0))
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


