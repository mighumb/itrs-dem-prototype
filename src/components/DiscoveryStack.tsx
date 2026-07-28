import { ChevronLeft, ChevronRight, Pencil, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import type { DiscoveryQuestion, JourneyProposal } from '../mock/discovery'

type StackMode = 'questions' | 'proposals'

/** How much of the next clipped row stays visible as a scroll cue. */
const PEEK_PX = 40

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
  const { t } = useLocale()
  const [otherText, setOtherText] = useState('')
  const [canScrollDown, setCanScrollDown] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const peekWrapRef = useRef<HTMLDivElement>(null)
  const question = questions[questionIndex]
  const total = mode === 'questions' ? questions.length : proposals.length
  const current = mode === 'questions' ? questionIndex + 1 : 1
  const savedAnswer = question ? answers[question.id] : undefined
  const isCustomAnswer = Boolean(
    savedAnswer && question && !question.options.includes(savedAnswer),
  )
  const proposalKey = proposals.map((p) => p.id).join('\0')
  const optionKey = question?.options.join('\0') ?? ''

  /** Submitting the current free-text answer would finish the whole form. */
  const otherSubmitCompletesForm =
    mode === 'questions' &&
    Boolean(question) &&
    questions.every((q) =>
      q.id === question!.id
        ? Boolean(otherText.trim())
        : Boolean(answers[q.id]?.trim()),
    )

  // Restore custom free-text when navigating between questions.
  // Depend on the saved string for this question — never on the answers object
  // identity (default `answers = {}` / `?? {}` would wipe keystrokes every render).
  const savedForQuestion = question ? answers[question.id] : undefined
  useEffect(() => {
    if (mode !== 'questions' || !question) return
    if (savedForQuestion && !question.options.includes(savedForQuestion)) {
      setOtherText(savedForQuestion)
    } else {
      setOtherText('')
    }
    // question read from render where these primitive deps last changed
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid object-identity resets while typing
  }, [mode, questionIndex, question?.id, savedForQuestion, optionKey])

  const updateScrollCue = () => {
    const el = scrollRef.current
    if (!el) {
      setCanScrollDown(false)
      return
    }
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }

  /**
   * When the list overflows but the fold lands cleanly between rows, force a
   * peek into the next row so “more below” is obvious without a second counter.
   * Same cue for questions (options) and proposals. Height is applied on the
   * wrap (scroll + fade) so the fade stays glued to the fold.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current
    const wrap = peekWrapRef.current
    if (!el || !wrap) return
    let raf = 0

    const applyPeek = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const prev = wrap.style.maxHeight
        wrap.style.maxHeight = ''
        void wrap.offsetHeight

        const items = Array.from(el.querySelectorAll<HTMLElement>('[data-stack-item]'))
        if (items.length === 0 || el.scrollHeight <= el.clientHeight + 1) {
          if (prev) wrap.style.maxHeight = ''
          updateScrollCue()
          return
        }

        const viewBottom = el.clientHeight
        let next = ''
        for (const item of items) {
          const top = item.offsetTop
          const bottom = top + item.offsetHeight
          // Already cutting through a row — natural peek, keep layout.
          if (top < viewBottom && bottom > viewBottom + 4) break
          // Fold sits in the gap before this row — pull the fold into the row.
          if (top >= viewBottom - 4) {
            const desired = Math.max(PEEK_PX + 8, top + PEEK_PX)
            if (desired < viewBottom) next = `${desired}px`
            break
          }
        }

        wrap.style.maxHeight = next
        updateScrollCue()
      })
    }

    applyPeek()
    window.addEventListener('resize', applyPeek)
    window.visualViewport?.addEventListener('resize', applyPeek)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', applyPeek)
      window.visualViewport?.removeEventListener('resize', applyPeek)
      wrap.style.maxHeight = ''
    }
  }, [mode, questionIndex, question?.id, optionKey, proposalKey, title])

  return (
    <div className="animate-fade-in flex max-h-[min(calc(var(--app-height,100dvh)*0.42),22rem)] w-full flex-col overflow-hidden overscroll-contain rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] md:max-h-[min(calc(var(--app-height,100dvh)*0.55),28rem)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/40">
      <header className="relative z-10 flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {title}
        </p>
        {mode === 'questions' && total > 1 && (
          <div className="flex shrink-0 items-center gap-0.5 text-zinc-400">
            <button
              type="button"
              disabled={questionIndex <= 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onQuestionIndexChange?.(questionIndex - 1)}
              className="cursor-pointer rounded-md p-1 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
              aria-label={t('previousQuestion')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums">
              {current} / {total}
            </span>
            <button
              type="button"
              disabled={questionIndex >= total - 1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onQuestionIndexChange?.(questionIndex + 1)}
              className="cursor-pointer rounded-md p-1 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
              aria-label={t('nextQuestion')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          title={t('dismiss')}
          className="cursor-pointer rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </header>

      <div
        ref={peekWrapRef}
        className="relative z-0 min-h-0 max-h-full flex-1 overflow-hidden"
      >
        <div
          ref={scrollRef}
          onScroll={updateScrollCue}
          className="h-full min-h-0 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-y-contain p-2"
        >
          {mode === 'questions' && question && (
            <>
              <p className="px-2 pb-2 pt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {question.prompt}
              </p>
              <div className="space-y-1">
                {question.options.map((option, index) => {
                  const selected = answers[question.id] === option
                  return (
                    <button
                      key={option}
                      type="button"
                      data-stack-item
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelectOption?.(question.id, option)}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        selected
                          ? 'bg-[#0071e3]/12 font-medium text-zinc-900 dark:bg-[#0071e3]/20 dark:text-zinc-100'
                          : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/70'
                      }`}
                    >
                      <span
                        className={`w-4 shrink-0 text-xs ${
                          selected ? 'text-[#0071e3]' : 'text-zinc-400'
                        }`}
                      >
                        {index + 1}.
                      </span>
                      <span className="min-w-0 flex-1">{option}</span>
                      {selected && (
                        <ChevronRight
                          size={14}
                          className="shrink-0 text-[#0071e3]/70"
                          aria-hidden
                        />
                      )}
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
                  data-stack-item
                  onClick={() => onSelectProposal?.(proposal)}
                  className="flex w-full cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
                >
                  <span className="mt-0.5 w-4 shrink-0 text-xs text-zinc-400">
                    {index + 1}.
                  </span>
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
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 dark:from-zinc-900 ${
            canScrollDown ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      <footer className="relative z-10 flex shrink-0 items-center gap-2 border-t border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
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
                // Keep text in questions mode so revisiting the step still shows the answer
                if (mode === 'proposals') setOtherText('')
              }
            }}
            // text-base (16px): iOS Safari zooms inputs under 16px and breaks the sticky/shell frame.
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={mode === 'proposals' ? t('other') : t('somethingElse')}
            className={`w-full rounded-xl border py-2.5 pl-8 pr-3 text-base outline-none transition placeholder:text-zinc-400 focus:border-[#0071e3] focus:bg-white dark:focus:bg-zinc-900 ${
              isCustomAnswer || (mode === 'questions' && otherText.trim())
                ? 'border-[#0071e3] bg-white font-medium text-zinc-900 dark:border-[#0071e3] dark:bg-zinc-900 dark:text-zinc-100'
                : 'border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
            }`}
          />
        </div>
        {!otherText.trim() && mode === 'questions' && (
          <button
            type="button"
            onClick={onSkipQuestion}
            className="shrink-0 cursor-pointer rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {t('skip')}
          </button>
        )}
        {!otherText.trim() && mode === 'proposals' && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer rounded-xl px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            {t('skip')}
          </button>
        )}
        {otherText.trim() ? (
          <button
            type="button"
            onClick={() => {
              onSubmitOther?.(otherText.trim())
              if (mode === 'proposals') setOtherText('')
            }}
            className="shrink-0 cursor-pointer rounded-xl bg-[#0071e3] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0077ed]"
          >
            {mode === 'questions' && !otherSubmitCompletesForm
              ? t('continueNext')
              : t('done')}
          </button>
        ) : null}
      </footer>
    </div>
  )
}
