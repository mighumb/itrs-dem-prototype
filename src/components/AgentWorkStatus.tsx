import { useLocale } from '../context/LocaleContext'

interface AgentWorkStatusProps {
  /** Live STATUS line from Gemini when available; otherwise falls back to Thinking… */
  status?: string | null
  /** Slightly denser styling for the workspace agent panel */
  compact?: boolean
}

/**
 * Cursor-like working indicator: default localized “Thinking…”, then each streamed
 * STATUS replaces it with a shimmer sweep on the text.
 */
export default function AgentWorkStatus({ status, compact }: AgentWorkStatusProps) {
  const { t } = useLocale()
  const label = status?.trim() || t('agentThinking')

  return (
    <p
      key={label}
      className={`agent-status-shimmer animate-fade-in ${
        compact ? 'text-[11px]' : 'text-sm'
      }`}
      aria-live="polite"
    >
      {label}
    </p>
  )
}
