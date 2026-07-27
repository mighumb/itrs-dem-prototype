import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../context/LocaleContext'
import { computeLastRunKpi, formatDurationMs } from '../lib/runMonitoring'
import type { LastRunSnapshot, LastRunStepMetric } from '../types'

interface MonitoringColumnProps {
  isUnsaved?: boolean
  journeyName: string
  lastRun: LastRunSnapshot | null
  onClose: () => void
  onSave: () => void
  embedded?: boolean
}

export default function MonitoringColumn({
  isUnsaved,
  journeyName,
  lastRun,
  onClose,
  onSave,
  embedded,
}: MonitoringColumnProps) {
  const { t, tf, locale } = useLocale()
  const runSteps = lastRun?.steps ?? []
  const [selectedStepId, setSelectedStepId] = useState(runSteps[0]?.stepId ?? '')
  const [lightboxStepId, setLightboxStepId] = useState<string | null>(null)

  const failedCount = runSteps.filter((s) => s.status === 'failed').length
  const kpi = computeLastRunKpi(lastRun, locale)
  const showAlert = failedCount > 0
  const alertTitle = t('stepFailureDetected')
  const alertMessage = tf('stepsFailedInRun', { count: failedCount })
  const isSimulated = lastRun?.mode === 'simulated'

  const lightboxSteps = useMemo(
    () => runSteps.filter((step) => Boolean(step.screenshotDataUrl)),
    [runSteps],
  )

  useEffect(() => {
    if (!runSteps.some((step) => step.stepId === selectedStepId)) {
      setSelectedStepId(runSteps[0]?.stepId ?? '')
    }
  }, [runSteps, selectedStepId])

  useEffect(() => {
    if (lightboxStepId && !lightboxSteps.some((step) => step.stepId === lightboxStepId)) {
      setLightboxStepId(null)
    }
  }, [lightboxStepId, lightboxSteps])

  const selectedStep =
    runSteps.find((step) => step.stepId === selectedStepId) ?? runSteps[0] ?? null

  const openLightbox = (stepId: string) => {
    setSelectedStepId(stepId)
    if (runSteps.some((s) => s.stepId === stepId && s.screenshotDataUrl)) {
      setLightboxStepId(stepId)
    }
  }

  const footer = isUnsaved ? (
    <div className="shrink-0 border-t border-amber-200/60 bg-amber-50 px-3 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/40">
      <p className="text-[11px] leading-snug text-amber-900 dark:text-amber-100">
        <button
          type="button"
          onClick={onSave}
          className="cursor-pointer font-medium text-[#0071e3] hover:underline"
        >
          {t('signUpLink')}
        </button>{' '}
        {t('signUpToUnlockMonitoring')}
      </p>
    </div>
  ) : (
    <div className="flex shrink-0 items-start gap-2 border-t border-emerald-200/60 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-200">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
      {lastRun?.mode === 'playwright' ? t('monitoringFromThisRun') : t('liveMonitoringActive')}
    </div>
  )

  const scrollBody = (
    <div className="@container/monitoring min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
      {isSimulated && (
        <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-900">
          {t('monitoringSimulatedBanner')}
        </div>
      )}

      {showAlert && (
        <div className="mb-4 flex gap-2 rounded-xl border border-red-200/80 bg-red-50/90 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div className="text-xs">
            <p className="font-medium text-red-900">{alertTitle}</p>
            <p className="mt-0.5 text-red-800/80">{alertMessage}</p>
          </div>
        </div>
      )}

      <h2 className="mb-3 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {journeyName}
      </h2>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <KpiCard
          label={t('availability')}
          value={kpi.availability}
          negative={failedCount > 0}
        />
        <KpiCard label={t('totalTime')} value={kpi.totalTime} />
        <KpiCard
          label={t('issues')}
          value={kpi.failingSteps}
          negative={!kpi.failingSteps.startsWith('0')}
        />
      </div>

      <div className="@container rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/40">
        {runSteps.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">{t('noExecutedSteps')}</p>
        ) : (
          <div className="flex gap-[clamp(0.4rem,1.8cqw,0.75rem)] overflow-x-auto pb-1">
            {runSteps.map((step) => {
              const isSelected = step.stepId === selectedStepId
              const isFailed = step.status === 'failed'
              const stepNumber = step.index + 1
              const shortLabel = step.label.split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
              const hasShot = Boolean(step.screenshotDataUrl)

              return (
                <div
                  key={step.stepId}
                  className={`group relative flex w-[clamp(7.5rem,42cqw,14rem)] shrink-0 flex-col gap-[clamp(0.3rem,1.4cqw,0.55rem)] rounded-lg border p-[clamp(0.3rem,1.2cqw,0.5rem)] text-left transition ${
                    isSelected
                      ? 'border-[#0071e3] bg-[#0071e3]/8 ring-2 ring-[#0071e3]/25'
                      : isFailed
                        ? 'border-red-200 bg-red-50/60 hover:border-red-300'
                        : 'border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedStepId(step.stepId)}
                    className="flex w-full cursor-pointer flex-col gap-[clamp(0.3rem,1.4cqw,0.55rem)] text-left"
                  >
                    <CaptureFrame
                      src={step.screenshotDataUrl}
                      failed={isFailed}
                      size="thumb"
                    />
                    <div className="min-w-0 px-0.5 text-center">
                      <p
                        className={`truncate text-[clamp(0.65rem,2.6cqw,0.8rem)] font-medium leading-tight ${
                          isSelected ? 'text-[#0071e3]' : 'text-zinc-700 dark:text-zinc-200'
                        }`}
                      >
                        <span className="tabular-nums">{stepNumber}</span>
                        <span className="mx-1 text-zinc-300 dark:text-zinc-600">·</span>
                        {shortLabel}
                      </p>
                      <p className="mt-0.5 text-[clamp(0.6rem,2.3cqw,0.72rem)] tabular-nums text-zinc-400">
                        {formatDurationMs(step.durationMs)}
                      </p>
                    </div>
                  </button>

                  {hasShot && (
                    <button
                      type="button"
                      title={t('expandScreenshot')}
                      aria-label={t('expandScreenshot')}
                      onClick={(event) => {
                        event.stopPropagation()
                        openLightbox(step.stepId)
                      }}
                      className="absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-zinc-950/70 text-white opacity-0 shadow transition hover:bg-zinc-950/85 group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <Expand size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedStep && (
        <StepDetailPanel
          step={selectedStep}
          onExpandCapture={() => openLightbox(selectedStep.stepId)}
        />
      )}
    </div>
  )

  const shell = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {scrollBody}
      {footer}
      {lightboxStepId && (
        <ScreenshotLightbox
          steps={lightboxSteps}
          activeStepId={lightboxStepId}
          onActiveStepIdChange={setLightboxStepId}
          onClose={() => setLightboxStepId(null)}
        />
      )}
    </div>
  )

  if (embedded) {
    return shell
  }

  return (
    <section className="flex min-h-0 w-[min(480px,40%)] shrink-0 flex-col border-l border-zinc-200/80 bg-[#f5f5f7]">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {t('panelMonitoring')}
        </p>
        <button
          type="button"
          onClick={onClose}
          title={t('closeMonitoring')}
          className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-600"
        >
          <X size={14} />
        </button>
      </div>
      {shell}
    </section>
  )
}

function ScreenshotLightbox({
  steps,
  activeStepId,
  onActiveStepIdChange,
  onClose,
}: {
  steps: LastRunStepMetric[]
  activeStepId: string
  onActiveStepIdChange: (stepId: string) => void
  onClose: () => void
}) {
  const { t, tf } = useLocale()
  const index = Math.max(
    0,
    steps.findIndex((step) => step.stepId === activeStepId),
  )
  const step = steps[index] ?? null
  const hasPrev = index > 0
  const hasNext = index < steps.length - 1

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault()
        onActiveStepIdChange(steps[index - 1]!.stepId)
        return
      }
      if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault()
        onActiveStepIdChange(steps[index + 1]!.stepId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [hasNext, hasPrev, index, onActiveStepIdChange, onClose, steps])

  if (!step?.screenshotDataUrl || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-md animate-fade-in sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={t('expandScreenshot')}
      onClick={onClose}
    >
      <div
        className="relative flex w-[min(92vw,1100px)] max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/90 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              {tf('stepN', { n: step.index + 1 })}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-white">{step.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('closeScreenshot')}
            aria-label={t('closeScreenshot')}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </header>

        <div className="relative min-h-0 flex-1 bg-black/40 p-3 sm:p-4">
          <div className="mx-auto aspect-video max-h-[min(72vh,720px)] w-full overflow-hidden rounded-xl bg-zinc-900">
            <img
              src={step.screenshotDataUrl}
              alt={step.label}
              className="h-full w-full object-contain object-top"
            />
          </div>

          {hasPrev && (
            <button
              type="button"
              title={t('previousScreenshot')}
              aria-label={t('previousScreenshot')}
              onClick={() => onActiveStepIdChange(steps[index - 1]!.stepId)}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-zinc-950/70 text-white shadow transition hover:bg-zinc-950/90 sm:left-3"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              title={t('nextScreenshot')}
              aria-label={t('nextScreenshot')}
              onClick={() => onActiveStepIdChange(steps[index + 1]!.stepId)}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-zinc-950/70 text-white shadow transition hover:bg-zinc-950/90 sm:right-3"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function StepDetailPanel({
  step,
  onExpandCapture,
}: {
  step: LastRunStepMetric
  onExpandCapture: () => void
}) {
  const { t, tf } = useLocale()
  const isFailed = step.status === 'failed'
  const statusLabel = isFailed ? t('statusFailing') : t('statusOk')
  const hasShot = Boolean(step.screenshotDataUrl)

  return (
    <div className="mt-3 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/80 dark:bg-zinc-900">
      {/*
        Narrow monitoring: metrics stacked, large 16:9 capture below.
        Wide panel (other panels closed / monitoring expanded): metrics left, capture right.
      */}
      <div className="flex flex-col gap-4 @[40rem]/monitoring:grid @[40rem]/monitoring:grid-cols-[minmax(14rem,0.95fr)_minmax(0,1.35fr)] @[40rem]/monitoring:items-start @[40rem]/monitoring:gap-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                {tf('stepN', { n: step.index + 1 })}
              </p>
              <p className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {step.label}
              </p>
            </div>
            <StatusBadge status={isFailed ? 'failing' : 'ok'} label={statusLabel} />
          </div>

          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {t('whatWeMeasured')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCell label={t('stepDuration')} value={formatDurationMs(step.durationMs)} />
            {step.url && (
              <MetricCell label={t('monitoringPageUrl')} value={shortUrl(step.url)} hint={step.url} />
            )}
            {step.title && <MetricCell label={t('monitoringPageTitle')} value={step.title} />}
          </div>

          {step.error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-[11px] leading-relaxed text-red-800">
              {step.error}
            </p>
          )}
        </div>

        <div className="min-w-0 self-start @[40rem]/monitoring:max-h-[min(70vh,640px)] @[40rem]/monitoring:sticky @[40rem]/monitoring:top-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              {t('monitoringCapture')}
            </p>
            {hasShot && (
              <button
                type="button"
                onClick={onExpandCapture}
                title={t('expandScreenshot')}
                className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-[#0071e3] dark:hover:bg-zinc-800"
              >
                <Expand size={12} />
                {t('expandScreenshot')}
              </button>
            )}
          </div>
          <CaptureFrame
            src={step.screenshotDataUrl}
            failed={isFailed}
            size="hero"
            alt={tf('monitoringCaptureAlt', { label: step.label })}
            onOpen={hasShot ? onExpandCapture : undefined}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Thumb: cropped 16:9 cover.
 * Hero: 16:9 viewport with vertical scroll so the full Playwright page can be reviewed.
 */
function CaptureFrame({
  src,
  failed,
  size,
  alt = '',
  onOpen,
}: {
  src?: string
  failed?: boolean
  size: 'thumb' | 'hero'
  alt?: string
  onOpen?: () => void
}) {
  const radius = size === 'hero' ? 'rounded-xl' : 'rounded-md'
  const ring = failed ? 'ring-1 ring-red-300' : ''

  if (size === 'hero') {
    return (
      <div
        className={`relative aspect-video w-full overflow-y-auto overscroll-contain bg-zinc-200/80 dark:bg-zinc-800 ${radius} ${ring}`}
        onDoubleClick={onOpen}
      >
        {src ? (
          <img
            key={src}
            src={src}
            alt={alt}
            className="block w-full max-w-full h-auto"
            draggable={false}
          />
        ) : (
          <div className="flex h-full min-h-full w-full items-center justify-center text-sm text-zinc-400">
            —
          </div>
        )}
        {failed && (
          <span className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded-md bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            !
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-zinc-200/80 dark:bg-zinc-800 ${radius} ${ring}`}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[clamp(0.6rem,2.4cqw,0.75rem)] text-zinc-400">
          —
        </div>
      )}
      {failed && (
        <span className="absolute right-[clamp(0.2rem,1cqw,0.35rem)] top-[clamp(0.2rem,1cqw,0.35rem)] flex h-[clamp(1rem,4cqw,1.25rem)] w-[clamp(1rem,4cqw,1.25rem)] items-center justify-center rounded-md bg-red-500 text-[clamp(0.55rem,2.2cqw,0.7rem)] font-bold text-white">
          !
        </span>
      )}
    </div>
  )
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    const display = `${parsed.hostname}${path}`
    return display.length > 36 ? `${display.slice(0, 34)}…` : display
  } catch {
    return url.length > 36 ? `${url.slice(0, 34)}…` : url
  }
}

function MetricCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
      <p className="text-[10px] font-medium text-zinc-600">{label}</p>
      <p
        className="mt-0.5 truncate text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
        title={hint ?? value}
      >
        {value}
      </p>
    </div>
  )
}

function StatusBadge({
  status,
  label,
}: {
  status: 'ok' | 'failing'
  label: string
}) {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-700',
    failing: 'bg-red-50 text-red-600',
  }

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${styles[status]}`}
    >
      {label}
    </span>
  )
}

function KpiCard({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white p-2 text-center dark:border-zinc-700/80 dark:bg-zinc-900">
      <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold ${negative ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-100'}`}
      >
        {value}
      </p>
    </div>
  )
}
