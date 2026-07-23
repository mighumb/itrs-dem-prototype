import { ChevronRight, Sparkles, X } from 'lucide-react'
import type { ChatMessage } from '../types'

interface GlobalAgentProps {
  open: boolean
  onToggle: () => void
  onNavigate?: (target: string) => void
}

const QUICK_PROMPTS = [
  'Create a new journey',
  'Show failing journeys',
  'Open Dashboard',
]

export default function GlobalAgent({ open, onToggle, onNavigate }: GlobalAgentProps) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Assistant — ask anything, navigate the app"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[#0071e3] text-white transition hover:bg-[#0077ed]"
        aria-label="Open assistant"
      >
        <Sparkles size={20} />
      </button>
    )
  }

  return (
    <aside className="fixed bottom-6 right-6 z-40 flex h-[min(520px,70vh)] w-[min(360px,90vw)] flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-700/80 dark:bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 text-sm font-semibold dark:text-zinc-100">
          <Sparkles size={16} className="text-[#0071e3]" />
          Assistant
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        <p className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800">
          Ask me to navigate, open a view, or explain anything in ITRS DEM.
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onNavigate?.(prompt)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <footer className="border-t border-zinc-100 p-3 dark:border-zinc-800">
        <input
          type="text"
          placeholder="Ask anything…"
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900"
        />
      </footer>
    </aside>
  )
}

export function AgentMessage({
  message,
  onActionClick,
  hideActions,
}: {
  message: ChatMessage
  onActionClick?: (actionId: string) => void
  hideActions?: boolean
}) {
  const isAgent = message.role === 'agent'

  const bubbleContent = message.content.split('\n').map((line, i) => (
    <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
      {isAgent
        ? line.split('**').map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part,
          )
        : line}
    </p>
  ))

  return (
    <div className="animate-fade-in space-y-2">
      {message.content && (
        <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
          <div
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              isAgent
                ? 'rounded-bl-md bg-transparent text-zinc-800 dark:text-zinc-200'
                : 'rounded-br-md bg-[var(--color-user-bubble)] text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {bubbleContent}
          </div>
        </div>
      )}

      {message.actions && !hideActions && (
        <div className="flex w-full flex-col gap-2">
          {message.actions.map((action) =>
            action.variant === 'primary' ? (
              <button
                key={action.id}
                type="button"
                onClick={() => onActionClick?.(action.id)}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl bg-[#0071e3] px-3.5 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-[#0077ed]"
              >
                <span>{action.label}</span>
                <ChevronRight size={16} className="shrink-0 text-white/80" />
              </button>
            ) : (
              <button
                key={action.id}
                type="button"
                onClick={() => onActionClick?.(action.id)}
                className="group flex w-full cursor-pointer items-center justify-between rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              >
                <span>{action.label}</span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-zinc-300 transition group-hover:text-zinc-500"
                />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
