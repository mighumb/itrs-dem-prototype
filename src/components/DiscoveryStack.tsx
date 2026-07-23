import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import type { DiscoveryQuestion, JourneyProposal } from '../mock/discovery'

type StackMode = 'questions' | 'proposals'

interface DiscoveryStackProps {
  mode: StackMode
  title: string
  questions?: DiscoveryQuestion[]
  questionIndex?: number
  answers?: Record<string, string>
  proposals?: JourneyProposal[]
  onQuestionIndexChange?: (index: number) => void
  onSelectOption?: (questionId: string, option: string) => void
  onSkipQuestion?: () => void
  onClose: () => void
  onSelectProposal?: (proposal: JourneyProposal) => void
  onSubmitOther?: (text: string) => void
}

export default function DiscoveryStack({
  mode,
  title,
  questions = [],
  questionIndex = 0,
  answers = {},
  proposals = [],
  onQuestionIndexChange,
  onSelectOption,
  onSkipQuestion,
  onClose,
  onSelectProposal,
  onSubmitOther,
}: DiscoveryStackProps) {
  const [otherText, setOtherText] = useState('')
  const question = questions[questionIndex]
  const total = mode === 'questions' ? questions.length : proposals.length
  const current = mode === 'questions' ? questionIndex + 1 : 1

  return (
    <div className="animate-fade-in w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40">
      <header className="flex items-center gap-2 border-b border-zinc-100 px-3.5 py-2.5 dark:border-zinc-800">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {title}
        </p>
        {mode === 'questions' && total > 1 && (
          <div className="flex shrink-0 items-center gap-0.5 text-zinc-400">
            <button
              type="button"
              disabled={questionIndex <= 0}
              onClick={() => onQuestionIndexChange?.(questionIndex - 1)}
              className="cursor-pointer rounded-md p-1 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
              aria-label="Previous question"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums">
              {current} / {total}
            </span>
            <button
              type="button"
              disabled={questionIndex >= total - 1}
              onClick={() => onQuestionIndexChange?.(questionIndex + 1)}
              className="cursor-pointer rounded-md p-1 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
              aria-label="Next question"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Dismiss"
          className="cursor-pointer rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </header>

      <div className="p-2">
        {mode === 'questions' && question && (
          <>
            <p className="px-2 pb-2 pt-1 text-sm text-zinc-600 dark:text-zinc-300">{question.prompt}</p>
            <div className="space-y-1">
              {question.options.map((option, index) => {
                const selected = answers[question.id] === option
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onSelectOption?.(question.id, option)}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      selected
                        ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/70'
                    }`}
                  >
                    <span className="w-4 shrink-0 text-xs text-zinc-400">{index + 1}.</span>
                    <span className="min-w-0 flex-1">{option}</span>
                    {selected && <ChevronRight size={14} className="shrink-0 text-zinc-400" />}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {mode === 'proposals' && (
          <div className="space-y-1">
            {proposals.map((proposal, index) => (
              <button
                key={proposal.id}
                type="button"
                onClick={() => onSelectProposal?.(proposal)}
                className="flex w-full cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
              >
                <span className="mt-0.5 w-4 shrink-0 text-xs text-zinc-400">{index + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {proposal.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {proposal.description}
                  </span>
                </span>
                <ChevronRight size={14} className="mt-1 shrink-0 text-zinc-300" />
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
        <div className="relative min-w-0 flex-1">
          <Pencil
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && otherText.trim()) {
                onSubmitOther?.(otherText.trim())
                setOtherText('')
              }
            }}
            placeholder={mode === 'proposals' ? 'Other…' : 'Something else…'}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[#0071e3] focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900"
          />
        </div>
        {mode === 'questions' && (
          <button
            type="button"
            onClick={onSkipQuestion}
            className="shrink-0 cursor-pointer rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            Skip
          </button>
        )}
        {mode === 'proposals' && otherText.trim() && (
          <button
            type="button"
            onClick={() => {
              onSubmitOther?.(otherText.trim())
              setOtherText('')
            }}
            className="shrink-0 cursor-pointer rounded-xl bg-[#0071e3] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0077ed]"
          >
            OK
          </button>
        )}
      </footer>
    </div>
  )
}
