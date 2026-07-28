import { ExternalLink, Hand, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import {
  abortExtensionRecording,
  focusRecordingTab,
  getExtensionFrame,
  getExtensionSteps,
  pingExtension,
  startExtensionRecording,
  stopExtensionRecording,
  subscribeAbortRecording,
  subscribeImportRecording,
  type RecordedBrowserStep,
} from '../lib/extensionBridge'
import type { BrowserFrame } from '../types'

interface BrowserPanelProps {
  frame: BrowserFrame | null
  isRunning?: boolean
  /** Label of the action currently executing (frozen capture + overlay). */
  runningActionLabel?: string | null
  embedded?: boolean
  /** Site URL to open automatically when recording starts. */
  startUrl?: string | null
  /** When set, Take control / record import is available. */
  onApplyRecording?: (steps: RecordedBrowserStep[]) => void
  disabled?: boolean
}

type ControlPhase = 'closed' | 'checking' | 'missing' | 'ready' | 'recording' | 'importing'

export default function BrowserPanel({
  frame,
  isRunning,
  runningActionLabel,
  embedded,
  startUrl,
  onApplyRecording,
  disabled,
}: BrowserPanelProps) {
  const { t, tf } = useLocale()
  const [phase, setPhase] = useState<ControlPhase>('closed')
  const [stepCount, setStepCount] = useState(0)
  const [liveFrame, setLiveFrame] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Screenshot currently painted — kept frozen until the next one fully loads. */
  const [heldShot, setHeldShot] = useState<string | null>(null)
  /** Incoming screenshot decoding in the background. */
  const [pendingShot, setPendingShot] = useState<string | null>(null)
  const heldShotRef = useRef<string | null>(null)
  const onApplyRef = useRef(onApplyRecording)
  onApplyRef.current = onApplyRecording

  useEffect(() => {
    // Explicit null frame (run start / reset) clears the held capture.
    if (frame === null) {
      heldShotRef.current = null
      setHeldShot(null)
      setPendingShot(null)
      return
    }
    const next = frame.screenshotDataUrl ?? null
    if (!next) {
      // Metadata-only updates (step_start) must keep the previous screenshot frozen.
      return
    }
    if (next === heldShotRef.current) {
      setPendingShot(null)
      return
    }
    if (!heldShotRef.current) {
      heldShotRef.current = next
      setHeldShot(next)
      setPendingShot(null)
      return
    }
    setPendingShot(next)
  }, [frame])

  useEffect(() => {
    if (phase !== 'recording') return
    const id = window.setInterval(() => {
      void Promise.all([getExtensionSteps(), getExtensionFrame()]).then(([steps, shot]) => {
        setStepCount(steps.length)
        if (shot.frame) setLiveFrame(shot.frame)
        if (shot.frameUrl) setLiveUrl(shot.frameUrl)
      })
    }, 800)
    return () => window.clearInterval(id)
  }, [phase])

  // Import from Chrome recording-tab banner ("Arrêter et importer").
  useEffect(() => {
    return subscribeImportRecording((steps) => {
      const apply = onApplyRef.current
      if (!apply || steps.length === 0) {
        setPhase((prev) => (prev === 'recording' ? 'ready' : prev))
        if (steps.length === 0) setError(t('extensionNoSteps'))
        return
      }
      apply(steps)
      setPhase('closed')
      setStepCount(0)
      setLiveFrame(null)
      setError(null)
    })
  }, [t])

  // Abort from Chrome recording-tab banner ("Abandonner").
  useEffect(() => {
    return subscribeAbortRecording(() => {
      setPhase('closed')
      setStepCount(0)
      setLiveFrame(null)
      setLiveUrl(null)
      setError(null)
    })
  }, [])

  const promotePendingShot = (src: string) => {
    heldShotRef.current = src
    setHeldShot(src)
    setPendingShot((current) => (current === src ? null : current))
  }

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
      const shot = await getExtensionFrame()
      setStepCount(steps.length)
      setLiveFrame(shot.frame)
      setLiveUrl(shot.frameUrl)
      setPhase('recording')
      return
    }
    setStepCount(0)
    setLiveFrame(null)
    setLiveUrl(null)
    setPhase('ready')
  }

  const handleStart = async () => {
    setError(null)
    const ok = await startExtensionRecording(startUrl)
    if (!ok) {
      setError(t('extensionStartFailed'))
      setPhase('missing')
      return
    }
    setStepCount(0)
    setLiveFrame(null)
    setLiveUrl(startUrl ?? null)
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
      setLiveFrame(null)
    } catch {
      setError(t('extensionStartFailed'))
      setPhase('ready')
    }
  }

  const handleAbortRecording = async () => {
    setError(null)
    try {
      await abortExtensionRecording()
    } catch {
      // Still close the UI even if the extension is unreachable.
    }
    setPhase('closed')
    setStepCount(0)
    setLiveFrame(null)
    setLiveUrl(null)
  }

  const handleCancel = () => {
    if (phase === 'recording') {
      void handleAbortRecording()
      return
    }
    setPhase('closed')
    setError(null)
  }

  const displayUrl =
    phase === 'recording'
      ? liveUrl || startUrl || frame?.url || 'about:blank'
      : frame?.url ?? 'about:blank'

  const showLiveMirror = phase === 'recording' && Boolean(liveFrame)
  const hasHeldShot = Boolean(heldShot)
  const showActionOverlay = Boolean(isRunning && runningActionLabel && !showLiveMirror)

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
          {displayUrl}
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
      </div>

      <div className="relative flex-1 overflow-hidden bg-zinc-200/70 dark:bg-zinc-900/80">
        {showLiveMirror ? (
          <img
            key={liveFrame!.slice(0, 64)}
            src={liveFrame!}
            alt={t('extensionLiveView')}
            className="h-full w-full object-contain object-top bg-white"
          />
        ) : hasHeldShot ? (
          <>
            <img
              src={heldShot!}
              alt={frame?.title || frame?.url || t('browserScreenshotAlt')}
              className="h-full w-full object-contain object-top bg-white"
            />
            {pendingShot && pendingShot !== heldShot && (
              <img
                src={pendingShot}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-contain object-top opacity-0"
                onLoad={() => promotePendingShot(pendingShot)}
                onError={() => setPendingShot(null)}
              />
            )}
          </>
        ) : !frame ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-zinc-500">{t('browserPreview')}</p>
            <p className="max-w-xs text-xs text-zinc-400">{t('browserPreviewHint')}</p>
          </div>
        ) : isRunning ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <p className="text-sm font-medium text-zinc-500">{frame.title || t('live')}</p>
            <p className="max-w-xs text-xs text-zinc-400">{t('browserPreviewHint')}</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-zinc-500">{t('browserPreview')}</p>
            <p className="max-w-xs text-xs text-zinc-400">{t('extensionHint')}</p>
          </div>
        )}

        {showActionOverlay && (
          <div
            className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-zinc-950/55 px-4 backdrop-blur-[1px]"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-white/15 bg-zinc-950/80 px-5 py-4 text-center text-white shadow-xl">
              <Loader2 size={18} className="animate-spin text-emerald-300" />
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">
                {t('actionInProgress')}
              </p>
              <p className="text-sm font-semibold leading-snug text-white">{runningActionLabel}</p>
            </div>
          </div>
        )}

        {phase === 'recording' && !liveFrame && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50 px-4">
            <p className="max-w-xs rounded-xl bg-white/95 px-3 py-2 text-center text-xs text-zinc-700 shadow">
              {t('extensionMirrorHint')}
            </p>
          </div>
        )}

        {phase !== 'closed' && phase !== 'recording' && (
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
                  {startUrl ? (
                    <p className="truncate text-[11px] text-zinc-500">
                      {t('extensionWillOpen')} {startUrl}
                    </p>
                  ) : null}
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
            </div>
          </div>
        )}
      </div>

      {phase === 'recording' && (
        <div className="space-y-2 border-t border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-red-800 dark:text-red-200">
                {t('extensionRecordingTitle')}
              </p>
              <p className="mt-0.5 text-[11px] text-red-800/80 dark:text-red-200/80">
                {t('extensionRecordingBody')}
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-red-700 dark:text-red-300">
              {tf('extensionStepCount', { count: stepCount })}
            </span>
          </div>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void focusRecordingTab()}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800"
            >
              <ExternalLink size={12} />
              {t('extensionFocusTab')}
            </button>
            <button
              type="button"
              onClick={() => void handleStopImport()}
              className="rounded-lg bg-[#0071e3] px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              {t('extensionStopImport')}
            </button>
            <button
              type="button"
              onClick={() => void handleAbortRecording()}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-800"
            >
              {t('extensionAbort')}
            </button>
          </div>
        </div>
      )}

      {phase !== 'recording' && (
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
          {hasHeldShot && (
            <span className="text-[10px] text-zinc-400">{t('playwrightCapture')}</span>
          )}
          {onApplyRecording && !hasHeldShot && (
            <span className="text-[10px] text-zinc-400">{t('extensionHint')}</span>
          )}
        </div>
      )}
    </div>
  )
}
