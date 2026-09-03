import { useLocale } from '../context/LocaleContext'
import { ChevronRight, Download, FileJson, Sparkles, X } from 'lucide-react'
import type { MessageKey } from '../i18n/messages'
import { maskSensitiveDisplayText } from '../lib/sensitiveAnswers'
import type { ChatMessage } from '../types'

interface GlobalAgentProps {
  open: boolean
  onToggle: () => void
  onNavigate?: (target: string) => void
}

const QUICK_PROMPTS: { id: string; labelKey: MessageKey }[] = [
  { id: 'new-journey', labelKey: 'agentPromptNewJourney' },
  { id: 'failing-journeys', labelKey: 'agentPromptFailing' },
  { id: 'dashboard', labelKey: 'agentPromptDashboard' },
]

export default function GlobalAgent({ open, onToggle, onNavigate }: GlobalAgentProps) {
  const { t } = useLocale()

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title={t('assistantTitle')}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-[#0071e3] text-white transition hover:bg-[#0077ed]"
        aria-label={t('openAssistant')}
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
          {t('assistant')}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label={t('dismiss')}
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        <p className="break-words rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800">{t('assistantIntro')}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onNavigate?.(prompt.id)}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            >
              {t(prompt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <footer className="border-t border-zinc-100 p-3 dark:border-zinc-800">
        <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {t('globalAgentInputHint')}
        </p>
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
  const { t } = useLocale()
  const isAgent = message.role === 'agent'
  const attachment = message.attachment

  const bubbleContent = maskSensitiveDisplayText(message.content).split('\n').map((line, i) => (
    <p key={i} className={`break-words [overflow-wrap:anywhere] ${i > 0 ? 'mt-1.5' : ''}`}>
      {isAgent
        ? line.split('**').map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part,
          )
        : line}
    </p>
  ))

  const workTrace =
    isAgent && message.workTrace && message.workTrace.length > 0 ? message.workTrace : null

  return (
    <div className="animate-fade-in min-w-0 space-y-2 overflow-x-hidden">
      {message.content && (
        <div className={`flex min-w-0 ${isAgent ? 'justify-start' : 'justify-end'}`}>
          <div
            className={`min-w-0 max-w-[85%] overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words [overflow-wrap:anywhere] whitespace-pre-wrap ${
              isAgent
                ? 'rounded-bl-md bg-transparent text-zinc-800 dark:text-zinc-200'
                : 'rounded-br-md bg-[var(--color-user-bubble)] text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {bubbleContent}
          </div>
        </div>
      )}

      {workTrace && (
        <div className="flex min-w-0 justify-start">
          <div className="min-w-0 max-w-[85%] rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900/50 dark:text-zinc-400">
            <p className="mb-1 font-medium text-zinc-600 dark:text-zinc-300">{t('workTraceLabel')}</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {workTrace.map((line, index) => (
                <li key={`${index}-${line.slice(0, 24)}`} className="break-words [overflow-wrap:anywhere]">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {attachment && (
        <div className={`flex min-w-0 ${isAgent ? 'justify-start' : 'justify-end'}`}>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([attachment.text], { type: attachment.mimeType || 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = attachment.filename
              a.rel = 'noopener'
              document.body.appendChild(a)
              a.click()
              a.remove()
              window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
            }}
            className="group flex max-w-[85%] min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            title={t('downloadJsonFile')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <FileJson size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {attachment.filename}
              </span>
              <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('jsonAttachmentHint')}
              </span>
            </span>
            <Download
              size={16}
              className="shrink-0 text-zinc-400 transition group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
            />
          </button>
        </div>
      )}

      {message.actions && !hideActions && (
        <div className="flex w-full min-w-0 flex-col gap-2">
          {message.actions.map((action) =>
            action.variant === 'primary' ? (
              <button
                key={action.id}
                type="button"
                onClick={() => onActionClick?.(action.id)}
                className="flex w-full min-w-0 cursor-pointer items-center justify-between rounded-xl bg-[#0071e3] px-3.5 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-[#0077ed]"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{action.label}</span>
                <ChevronRight size={16} className="shrink-0 text-white/80" />
              </button>
            ) : (
              <button
                key={action.id}
                type="button"
                onClick={() => onActionClick?.(action.id)}
                className="group flex w-full min-w-0 cursor-pointer items-center justify-between rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{action.label}</span>
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
