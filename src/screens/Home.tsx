import { ArrowUp, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import DiscoveryStack from '../components/DiscoveryStack'
import { AgentMessage } from '../components/GlobalAgent'
import { useLocale } from '../context/LocaleContext'
import { requestDiscoveryAi, type DiscoveryAiResult } from '../lib/discoveryAi'
import { getHomeExamples, isCuratedHomeExample } from '../mock/data'
import {
  buildConfigureQuestions,
  buildDiscoveryQuestions,
  buildPlanFromPrompt,
  buildPlanFromProposal,
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
  onStart: (prompt: string) => void
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
  const [aiProviderLabel, setAiProviderLabel] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const noteAi = (ai: { source: 'gemini' | 'mock'; model: string | null }) => {
    if (ai.source === 'gemini') {
      setAiProviderLabel(ai.model ? `Gemini · ${ai.model}` : 'Gemini')
    } else {
      setAiProviderLabel('mock')
    }
  }

  const rememberSnapshot = (ai: DiscoveryAiResult) => {
    if (!ai.pageSnapshot && !ai.siteAnalysis) return
    setCtx((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        url: ai.siteAnalysis?.url ?? prev.url,
        pageSnapshot: ai.pageSnapshot ?? prev.pageSnapshot ?? null,
      }
    })
  }

  const inSession = phase !== 'idle'
  const showStack = phase === 'questionnaire' || phase === 'proposals'
  const showRun = phase === 'planning' && Boolean(plan)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, agentTyping, workStatus, showStack, showRun])

  const pushMessages = (...next: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...next])
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
    prevLocaleRef.current = locale

    const session = sessionRef.current
    if (session.agentTyping) return

    const needsProposals = session.phase === 'proposals' && session.proposals.length > 0
    const needsQuestions = session.phase === 'questionnaire' && session.questions.length > 0
    if (!needsProposals && !needsQuestions) return

    void withTyping(async (signal, onStatus) => {
      const payload = {
        action: 'relocalize_ui',
        targetLanguage: locale,
        proposals: needsProposals ? session.proposals : undefined,
        questions: needsQuestions ? session.questions : undefined,
      }

      const ai = await requestDiscoveryAi({
        mode: needsProposals
          ? 'propose'
          : session.configuring
            ? 'configure'
            : 'chat',
        userMessage: JSON.stringify(payload),
        messages: session.messages,
        phase: session.phase,
        context: session.ctx,
        selectedProposal: session.ctx?.selectedProposal ?? null,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      noteAi(ai)

      if (needsProposals && ai.proposals && ai.proposals.length > 0) {
        setProposals(ai.proposals)
      }
      if (needsQuestions && ai.questions && ai.questions.length > 0) {
        // Preserve answers keyed by id when ids stay stable.
        setQuestions(ai.questions)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to locale changes
  }, [locale])

  const historyPlus = (...extra: ChatMessage[]) => [...messages, ...extra]

  const pushAgentReply = (content: string) => {
    if (!content.trim()) return
    pushMessages({
      id: uid('agent'),
      role: 'agent',
      content,
    })
  }

  const enterPlanning = async (nextPlan: DiscoveryPlan, userLine?: string) => {
    const userMsg = userLine
      ? ({ id: uid('user'), role: 'user', content: userLine } as ChatMessage)
      : null
    if (userMsg) {
      pushMessages(userMsg)
    }
    // Keep Run/Lancer hidden until the plan message is fully ready to display.
    setPlan(null)
    setPhase('conversation')
    await withTyping(async (signal, onStatus) => {
      const history = userMsg ? historyPlus(userMsg) : messages
      const ai = await requestDiscoveryAi({
        mode: 'plan',
        userMessage: nextPlan.prompt,
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
      const planToShow = ai.plan ?? nextPlan
      const formatted = formatPlanMessage(planToShow)
      const content =
        ai.plan && (ai.message.includes('1.') || ai.message.includes('1)'))
          ? ai.message
          : ai.message
            ? `${ai.message}\n\n${formatted}`
            : formatted
      pushAgentReply(content)
      noteAi(ai)
      setPlan(planToShow)
      setPhase('planning')
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
      noteAi(ai)
      if (ai.proposals && ai.proposals.length > 0) {
        setProposals(ai.proposals)
        setPhase('proposals')
        pushAgentReply(ai.message)
        return
      }

      const nextQuestions =
        ai.questions && ai.questions.length > 0
          ? ai.questions
          : buildDiscoveryQuestions(nextCtx)
      setQuestions(nextQuestions)
      setPhase('questionnaire')
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
      noteAi(ai)
      const nextProposals = ai.proposals ?? []
      setProposals(nextProposals)
      setPhase(nextProposals.length > 0 ? 'proposals' : 'conversation')
      pushAgentReply(ai.message)
    })
  }

  const allQuestionsAnswered = (nextCtx: DiscoveryContext) =>
    questions.length > 0 && questions.every((q) => Boolean(nextCtx.answers[q.id]))

  const commitQuestionnaireAndPropose = async (nextCtx: DiscoveryContext) => {
    if (configuring && nextCtx.selectedProposal) {
      const blocks = questions
        .filter((q) => nextCtx.answers[q.id])
        .map((q) => `${q.prompt} → ${nextCtx.answers[q.id]}`)
      const summary = blocks.join('\n')
      const userMsg: ChatMessage = {
        id: uid('user'),
        role: 'user',
        content: summary || nextCtx.selectedProposal.title,
      }
      pushMessages(userMsg)
      setConfiguring(false)
      const promptWithParams = [
        nextCtx.selectedProposal.prompt,
        summary,
        nextCtx.seed,
      ]
        .filter(Boolean)
        .join(' — ')
      await enterPlanning(
        {
          ...buildPlanFromProposal(nextCtx.selectedProposal),
          prompt: promptWithParams,
        },
        undefined,
      )
      return
    }

    const blocks = questions
      .filter((q) => nextCtx.answers[q.id])
      .map((q) => `Q : ${q.prompt}\nR : ${nextCtx.answers[q.id]}`)

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
    await openProposals(nextCtx, historyPlus(...extra))
  }

  const saveQuestionnaireAnswer = async (questionId: string, option: string) => {
    if (!ctx) return
    const nextCtx = {
      ...ctx,
      answers: { ...ctx.answers, [questionId]: option },
    }
    setCtx(nextCtx)

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
    }
  }

  const handleCloseStack = () => {
    setConfiguring(false)
    setPhase('conversation')
    pushMessages({
      id: uid('agent'),
      role: 'agent',
      content: t('closeStack'),
    })
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
    setConfiguring(true)
    setQuestionIndex(0)

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
      if (ai.aborted) return
      rememberSnapshot(ai)
      const nextQuestions =
        ai.questions && ai.questions.length > 0
          ? ai.questions
          : buildConfigureQuestions(nextCtx, proposal)
      noteAi(ai)
      setQuestions(nextQuestions)
      setPhase('questionnaire')
      pushAgentReply(ai.message)
    })
  }

  const replyWithAiChat = async (text: string, history: ChatMessage[]) => {
    // Iterating away from a settled plan hides Run/Lancer until a full plan is shown again.
    setPlan(null)
    setPhase('conversation')
    await withTyping(async (signal, onStatus) => {
      const ai = await requestDiscoveryAi({
        mode: 'chat',
        userMessage: text,
        messages: history,
        phase: 'conversation',
        context: ctx,
        preferredLanguage: locale,
        signal,
        onStatus,
      })
      if (ai.aborted) return
      rememberSnapshot(ai)
      noteAi(ai)

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
        setPhase('proposals')
        pushAgentReply(ai.message)
        return
      }

      if (ai.questions && ai.questions.length > 0) {
        setQuestions(ai.questions)
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

  const handleExample = async (example: string) => {
    setInput('')
    await enterPlanning(buildPlanFromPrompt(example), example)
  }

  const handleSubmit = async (raw: string) => {
    const text = raw.trim()
    if (!text || agentTyping) return
    setInput('')

    if (phase === 'idle') {
      // Curated examples are the only shortcut to a ready plan.
      // Any free-typed message starts discovery (questions → proposals → plan).
      if (isCuratedHomeExample(text)) {
        await enterPlanning(buildPlanFromPrompt(text), text)
      } else {
        await startQuestionnaire(text)
      }
      return
    }

    // Questionnaire: save locally via main input — don't post to chat yet
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
        noteAi(ai)

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
          setPhase('proposals')
          pushAgentReply(ai.message)
          return
        }

        if (ai.questions && ai.questions.length > 0) {
          setQuestions(ai.questions)
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
    onStart(plan.prompt)
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
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl animate-fade-in">
          <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
            {userName && userName !== 'there' ? (
              <>
                {t('goodMorning')} {userName},
              </>
            ) : (
              t('homeGreetingGuest')
            )}
            <br />
            <span className="text-zinc-500 dark:text-zinc-400">{t('homeSubtitle')}</span>
          </h1>

          {composer}

          <div className="mt-8">
            <p className="mb-3 text-center text-xs text-zinc-400">{t('sampleJourneys')}</p>
            <div className="space-y-2">
              {getHomeExamples(locale).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void handleExample(example)}
                  className="w-full cursor-pointer rounded-xl border border-zinc-200/70 bg-zinc-50 px-4 py-3 text-left text-sm leading-relaxed text-zinc-600 transition hover:border-zinc-300 hover:bg-white dark:border-zinc-700/50 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      {/* One full-height scrollport so the scrollbar runs to the bottom of the input */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6 pt-8">
          <div className="mt-auto space-y-4 pb-4">
            {messages.map((message) => (
              <AgentMessage key={message.id} message={message} hideActions />
            ))}
            {agentTyping && (
              <div className="px-1 pt-1">
                {workStatus ? (
                  <p
                    key={workStatus}
                    className="animate-fade-in text-sm text-zinc-500 dark:text-zinc-400"
                  >
                    {workStatus}
                  </p>
                ) : (
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 [animation-delay:150ms] dark:bg-zinc-600" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 [animation-delay:300ms] dark:bg-zinc-600" />
                  </div>
                )}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-[var(--color-surface)] pb-6 pt-2">
            {showStack && phase === 'questionnaire' && (
              <DiscoveryStack
                mode="questions"
                title={configuring ? t('configureJourney') : t('refineJourney')}
                questions={questions}
                questionIndex={questionIndex}
                answers={ctx?.answers ?? {}}
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
                title={t('chooseJourney')}
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
            {aiProviderLabel && (
              <p className="px-1 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                {aiProviderLabel === 'mock' ? t('fallbackMock') : t('geminiDisclaimer')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


