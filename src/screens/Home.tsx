import { ArrowUp, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import DiscoveryStack from '../components/DiscoveryStack'
import { AgentMessage } from '../components/GlobalAgent'
import { HOME_EXAMPLES } from '../mock/data'
import {
  agentNeedsMoreContextMessage,
  buildDiscoveryQuestions,
  buildJourneyProposals,
  buildPlanFromPrompt,
  buildPlanFromProposal,
  classifyUserEntry,
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

const TYPING_MS = 550

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function Home({ userName = 'there', onStart }: HomeProps) {
  const [phase, setPhase] = useState<DiscoveryPhase>('idle')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [agentTyping, setAgentTyping] = useState(false)
  const [ctx, setCtx] = useState<DiscoveryContext | null>(null)
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [proposals, setProposals] = useState<JourneyProposal[]>([])
  const [plan, setPlan] = useState<DiscoveryPlan | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const inSession = phase !== 'idle'
  const showStack = phase === 'questionnaire' || phase === 'proposals'
  const showRun = phase === 'planning' && Boolean(plan)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, agentTyping, showStack, showRun])

  const pushMessages = (...next: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...next])
  }

  const withTyping = async (fn: () => void | Promise<void>) => {
    setAgentTyping(true)
    await delay(TYPING_MS)
    setAgentTyping(false)
    await fn()
  }

  const enterPlanning = async (nextPlan: DiscoveryPlan, userLine?: string) => {
    if (userLine) {
      pushMessages({ id: uid('user'), role: 'user', content: userLine })
    }
    setPlan(nextPlan)
    setPhase('planning')
    await withTyping(() => {
      pushMessages({
        id: uid('plan'),
        role: 'agent',
        content: formatPlanMessage(nextPlan),
      })
    })
  }

  const startQuestionnaire = async (seed: string) => {
    const nextCtx = createDiscoveryContext(seed)
    const nextQuestions = buildDiscoveryQuestions(nextCtx)
    setCtx(nextCtx)
    setQuestions(nextQuestions)
    setQuestionIndex(0)
    setProposals([])
    setPlan(null)
    setPhase('questionnaire')

    pushMessages({ id: uid('user'), role: 'user', content: seed })
    await withTyping(() => {
      pushMessages({
        id: uid('agent'),
        role: 'agent',
        content:
          "Got it — I'll refine a journey for this. A few quick questions, then I'll propose **3 paths**. You can also answer in the chat or dismiss the questionnaire anytime.",
      })
    })
  }

  const openProposals = async (nextCtx: DiscoveryContext) => {
    const nextProposals = buildJourneyProposals(nextCtx)
    setCtx(nextCtx)
    setProposals(nextProposals)
    setPhase('proposals')
    await withTyping(() => {
      pushMessages({
        id: uid('agent'),
        role: 'agent',
        content:
          'Based on that, here are **3 journey options**. Pick one, use **Other**, or keep chatting to refine.',
      })
    })
  }

  const allQuestionsAnswered = (nextCtx: DiscoveryContext) =>
    questions.length > 0 && questions.every((q) => Boolean(nextCtx.answers[q.id]))

  const commitQuestionnaireAndPropose = async (nextCtx: DiscoveryContext) => {
    const blocks = questions
      .filter((q) => nextCtx.answers[q.id])
      .map((q) => `Q : ${q.prompt}\nR : ${nextCtx.answers[q.id]}`)

    if (blocks.length > 0) {
      pushMessages({
        id: uid('user'),
        role: 'user',
        content: blocks.join('\n\n'),
      })
    }
    await openProposals(nextCtx)
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
    setPhase('conversation')
    pushMessages({
      id: uid('agent'),
      role: 'agent',
      content:
        'No problem — we can keep brainstorming in chat. When you have enough detail (site + goal), ask me to draft a plan.',
    })
  }

  const handleSelectProposal = async (proposal: JourneyProposal) => {
    setCtx((prev) => (prev ? { ...prev, selectedProposalId: proposal.id } : prev))
    await enterPlanning(buildPlanFromProposal(proposal), proposal.title)
  }

  const handleOther = async (text: string) => {
    if (phase === 'questionnaire' && questions[questionIndex]) {
      await saveQuestionnaireAnswer(questions[questionIndex].id, text)
      return
    }

    if (phase === 'proposals') {
      if (hasExploitableContext(text, ctx)) {
        await enterPlanning(buildPlanFromPrompt(text), text)
        return
      }
      pushMessages({ id: uid('user'), role: 'user', content: text })
      setPhase('conversation')
      await withTyping(() => {
        pushMessages({
          id: uid('agent'),
          role: 'agent',
          content: agentNeedsMoreContextMessage(text),
        })
      })
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
      if (classifyUserEntry(text) === 'precise') {
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

    // Active session — free chat
    pushMessages({ id: uid('user'), role: 'user', content: text })

    if (phase === 'proposals') {
      if (hasExploitableContext(text, ctx)) {
        await enterPlanning(buildPlanFromPrompt(text), undefined)
        return
      }

      setPhase('conversation')
      await withTyping(() => {
        pushMessages({
          id: uid('agent'),
          role: 'agent',
          content: agentNeedsMoreContextMessage(text),
        })
      })
      return
    }

    if (phase === 'planning') {
      // Iterate — leave planning, converse, then replan if enough context
      if (hasExploitableContext(text, ctx)) {
        const nextPlan = buildPlanFromPrompt(text)
        setPlan(nextPlan)
        await withTyping(() => {
          pushMessages({
            id: uid('plan'),
            role: 'agent',
            content: formatPlanMessage(nextPlan),
          })
        })
        return
      }

      setPhase('conversation')
      await withTyping(() => {
        pushMessages({
          id: uid('agent'),
          role: 'agent',
          content:
            "Understood — let's refine. Tell me what to change (add/remove a step, different goal, another site). When we're aligned I'll update the plan.",
        })
      })
      return
    }

    // conversation phase
    if (hasExploitableContext(text, ctx)) {
      await enterPlanning(buildPlanFromPrompt(text))
      return
    }

    // Maybe user pasted a URL mid-conversation → reopen questionnaire
    if (classifyUserEntry(text) === 'vague' && /https?:\/\//i.test(text)) {
      const nextCtx = createDiscoveryContext(text)
      const nextQuestions = buildDiscoveryQuestions(nextCtx)
      setCtx(nextCtx)
      setQuestions(nextQuestions)
      setQuestionIndex(0)
      setPhase('questionnaire')
      await withTyping(() => {
        pushMessages({
          id: uid('agent'),
          role: 'agent',
          content: "Nice — let's refine that URL with a couple of questions.",
        })
      })
      return
    }

    await withTyping(() => {
      pushMessages({
        id: uid('agent'),
        role: 'agent',
        content: agentNeedsMoreContextMessage(text),
      })
    })
  }

  const handleRun = () => {
    if (!plan) return
    onStart(plan.prompt)
  }

  const inputPlaceholder =
    phase === 'idle'
      ? 'Describe a journey or paste a URL...'
      : phase === 'questionnaire' || phase === 'proposals'
        ? 'Or reply directly…'
        : phase === 'planning'
          ? 'Ask to change a step, or refine the plan…'
          : 'Continue brainstorming…'

  const composer = (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit(input)
      }}
    >
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={inputPlaceholder}
        disabled={agentTyping}
        className="w-full rounded-2xl border border-zinc-200/80 bg-white py-4 pl-5 pr-14 text-base outline-none shadow-[0_4px_24px_rgba(0,0,0,0.06)] transition placeholder:text-zinc-400 focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[0_4px_28px_rgba(0,0,0,0.45)] dark:placeholder:text-zinc-500 dark:focus:ring-[#0071e3]/20"
      />
      <button
        type="submit"
        disabled={agentTyping || !input.trim()}
        className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl bg-[#0071e3] text-white transition hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Send"
      >
        <ArrowUp size={18} />
      </button>
    </form>
  )

  if (!inSession) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl animate-fade-in">
          <h1 className="mb-10 text-center text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
            Good morning {userName},
            <br />
            <span className="text-zinc-500 dark:text-zinc-400">
              what journey should we build today?
            </span>
          </h1>

          {composer}

          <div className="mt-8">
            <p className="mb-3 text-center text-xs text-zinc-400">
              Sample journeys to explore the product
            </p>
            <div className="space-y-2">
              {HOME_EXAMPLES.map((example) => (
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col pb-4 pt-8">
          <div className="mt-auto space-y-4">
            {messages.map((message) => (
              <AgentMessage key={message.id} message={message} hideActions />
            ))}
            {agentTyping && (
              <div className="flex gap-1 px-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 [animation-delay:150ms] dark:bg-zinc-600" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 [animation-delay:300ms] dark:bg-zinc-600" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-2">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {showStack && phase === 'questionnaire' && (
            <DiscoveryStack
              mode="questions"
              title="Refine the journey"
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
              title="Choose a journey"
              proposals={proposals}
              onClose={handleCloseStack}
              onSelectProposal={(proposal) => void handleSelectProposal(proposal)}
              onSubmitOther={(text) => void handleOther(text)}
            />
          )}

          {showRun && (
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-700 dark:bg-zinc-900">
              <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                Ready to run this user journey?
              </p>
              <button
                type="button"
                onClick={handleRun}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[#0071e3] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0077ed]"
              >
                <Play size={12} fill="currentColor" />
                Run
              </button>
            </div>
          )}

          {composer}
        </div>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
