import { Hand, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import {
  getExtensionSteps,
  pingExtension,
  startExtensionRecording,
  stopExtensionRecording,
  type RecordedBrowserStep,
} from '../lib/extensionBridge'
import type { BrowserFrame } from '../types'

interface BrowserPanelProps {
  frame: BrowserFrame | null
  isRunning?: boolean
  embedded?: boolean
  /** When set, Take control / record import is available. */
  onApplyRecording?: (steps: RecordedBrowserStep[]) => void
  disabled?: boolean
}

type ControlPhase = 'closed' | 'checking' | 'missing' | 'ready' | 'recording' | 'importing'

export default function BrowserPanel({
  frame,
  isRunning,
  embedded,
  onApplyRecording,
  disabled,
}: BrowserPanelProps) {
  const { t, tf } = useLocale()
  const hasScreenshot = Boolean(frame?.screenshotDataUrl)
  const [phase, setPhase] = useState<ControlPhase>('closed')
  const [stepCount, setStepCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (phase !== 'recording') return
    const id = window.setInterval(() => {
      void getExtensionSteps().then((steps) => setStepCount(steps.length))
    }, 1200)
    return () => window.clearInterval(id)
  }, [phase])

  const openTakeControl = async () => {
    if (disabled || isRunning) return
    setError(null)
    setPhase('checking')
    const { installed, recording } = await pingExtension()
    if (!installed) {
      setPhase('missing')
      return
    }
    if (recording) {
      const steps = await getExtensionSteps()
      setStepCount(steps.length)
      setPhase('recording')
      return
    }
    setStepCount(0)
    setPhase('ready')
  }

  const handleStart = async () => {
    setError(null)
    const ok = await startExtensionRecording()
    if (!ok) {
      setError(t('extensionStartFailed'))
      setPhase('missing')
      return
    }
    setStepCount(0)
    setPhase('recording')
  }

  const handleStopImport = async () => {
    if (!onApplyRecording) return
    setPhase('importing')
    setError(null)
    try {
      const steps = await stopExtensionRecording()
      if (steps.length === 0) {
        setError(t('extensionNoSteps'))
        setPhase('ready')
        return
      }
      onApplyRecording(steps)
      setPhase('closed')
      setStepCount(0)
    } catch {
      setError(t('extensionStartFailed'))
      setPhase('ready')
    }
  }

  const handleCancel = () => {
    setPhase('closed')
    setError(null)
  }

  return (
    <div
      className={`flex h-full flex-col overflow-hidden ${
        embedded ? '' : 'rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-700/80 dark:bg-zinc-900'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          {frame?.url ?? 'about:blank'}
        </div>
        {isRunning && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            {t('live')}
          </span>
        )}
        {phase === 'recording' && (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {t('recording')}
          </span>
        )}
        {frame?.title && hasScreenshot && (
          <span className="hidden max-w-[9rem] truncate text-[10px] text-zinc-400 md:inline">
            {frame.title}
          </span>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden bg-zinc-200/70 dark:bg-zinc-900/80">
        {!frame ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-zinc-500">{t('browserPreview')}</p>
            <p className="max-w-xs text-xs text-zinc-400">{t('browserPreviewHint')}</p>
          </div>
        ) : hasScreenshot ? (
          <img
            key={frame.screenshotDataUrl}
            src={frame.screenshotDataUrl}
            alt={frame.title || frame.url || t('browserScreenshotAlt')}
            className="h-full w-full object-contain object-top bg-white"
          />
        ) : isRunning ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <p className="text-sm font-medium text-zinc-500">{frame.title || t('live')}</p>
            <p className="max-w-xs text-xs text-zinc-400">{t('browserPreviewHint')}</p>
          </div>
        ) : (
          <>
            <div className="absolute inset-4 overflow-hidden rounded-lg bg-white">
              <div className="flex h-10 items-center border-b border-zinc-100 px-4">
                <div className="h-4 w-16 rounded bg-zinc-900" />
                <div className="ml-auto flex gap-3">
                  <div className="h-3 w-12 rounded bg-zinc-100" />
                  <div className="h-3 w-12 rounded bg-zinc-100" />
                  <div className="h-3 w-12 rounded bg-zinc-100" />
                </div>
              </div>
              <div className="p-4">
                <div className="mb-3 h-5 w-2/3 rounded bg-zinc-800" />
                <div className="mb-2 h-3 w-full rounded bg-zinc-100" />
                <div className="mb-2 h-3 w-5/6 rounded bg-zinc-100" />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="aspect-square rounded-lg bg-zinc-100" />
                  <div className="aspect-square rounded-lg bg-zinc-100" />
                  <div className="aspect-square rounded-lg bg-zinc-100" />
                </div>
              </div>

              {frame.cursor && (
                <div
                  className="pointer-events-none absolute h-4 w-4 transition-all duration-500"
                  style={{
                    left: `${frame.cursor.x}%`,
                    top: `${frame.cursor.y}%`,
                  }}
                >
                  <MousePointerIcon />
                </div>
              )}
            </div>
            {frame.highlight && (
              <p className="absolute bottom-3 left-3 right-3 truncate rounded-md bg-black/55 px-2 py-1 text-[11px] text-white">
                {frame.highlight}
              </p>
            )}
          </>
        )}

        {phase !== 'closed' && (
          <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/35 p-3 backdrop-blur-[1px]">
            <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {phase === 'checking' || phase === 'importing' ? (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <Loader2 size={14} className="animate-spin" />
                  {phase === 'importing' ? t('extensionImporting') : t('extensionChecking')}
                </div>
              ) : null}

              {phase === 'missing' ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t('extensionMissingTitle')}
                  </p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-300">
                    <li>{t('extensionInstallStep1')}</li>
                    <li>{t('extensionInstallStep2')}</li>
                    <li>{t('extensionInstallStep3')}</li>
                    <li>{t('extensionInstallStep4')}</li>
                  </ol>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void openTakeControl()}
                      className="rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {t('extensionRetry')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500"
                    >
                      {t('dismiss')}
                    </button>
                  </div>
                </div>
              ) : null}

              {phase === 'ready' ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t('extensionReadyTitle')}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">{t('extensionReadyBody')}</p>
                  {error ? <p className="text-xs text-red-600">{error}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleStart()}
                      className="rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {t('extensionStart')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500"
                    >
                      {t('dismiss')}
                    </button>
                  </div>
                </div>
              ) : null}

              {phase === 'recording' ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {t('extensionRecordingTitle')}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">
                    {t('extensionRecordingBody')}
                  </p>
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {tf('extensionStepCount', { count: stepCount })}
                  </p>
                  {error ? <p className="text-xs text-red-600">{error}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleStopImport()}
                      className="rounded-lg bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {t('extensionStopImport')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500"
                    >
                      {t('dismiss')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <button
          type="button"
          disabled={disabled || isRunning || !onApplyRecording}
          onClick={() => void openTakeControl()}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Hand size={12} />
          {t('takeControl')}
        </button>
        {hasScreenshot && (
          <span className="text-[10px] text-zinc-400">{t('playwrightCapture')}</span>
        )}
        {onApplyRecording && !hasScreenshot && (
          <span className="text-[10px] text-zinc-400">{t('extensionHint')}</span>
        )}
      </div>
    </div>
  )
}

function MousePointerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 3l14 9-6.5 1.5L11 20 5 3z"
        fill="#1d1d1f"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
