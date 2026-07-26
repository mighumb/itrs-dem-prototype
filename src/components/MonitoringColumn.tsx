import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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

  const failedCount = runSteps.filter((s) => s.status === 'failed').length
  const kpi = computeLastRunKpi(lastRun, locale)
  const showAlert = failedCount > 0
  const alertTitle = t('stepFailureDetected')
  const alertMessage = tf('stepsFailedInRun', { count: failedCount })
  const isSimulated = lastRun?.mode === 'simulated'

  useEffect(() => {
    if (!runSteps.some((step) => step.stepId === selectedStepId)) {
      setSelectedStepId(runSteps[0]?.stepId ?? '')
    }
  }, [runSteps, selectedStepId])

  const selectedStep =
    runSteps.find((step) => step.stepId === selectedStepId) ?? runSteps[0] ?? null

  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
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

                return (
                  <button
                    key={step.stepId}
                    type="button"
                    onClick={() => setSelectedStepId(step.stepId)}
                    className={`flex w-[clamp(7.5rem,42cqw,14rem)] shrink-0 cursor-pointer flex-col gap-[clamp(0.3rem,1.4cqw,0.55rem)] rounded-lg border p-[clamp(0.3rem,1.2cqw,0.5rem)] text-left transition ${
                      isSelected
                        ? 'border-[#0071e3] bg-[#0071e3]/8 ring-2 ring-[#0071e3]/25'
                        : isFailed
                          ? 'border-red-200 bg-red-50/60 hover:border-red-300'
                          : 'border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div
                      className={`relative aspect-video w-full overflow-hidden rounded-md bg-zinc-200/80 dark:bg-zinc-800 ${
                        isFailed ? 'ring-1 ring-red-300' : ''
                      }`}
                    >
                      {step.screenshotDataUrl ? (
                        <img
                          src={step.screenshotDataUrl}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[clamp(0.6rem,2.4cqw,0.75rem)] text-zinc-400">
                          —
                        </div>
                      )}
                      {isFailed && (
                        <span className="absolute right-[clamp(0.2rem,1cqw,0.35rem)] top-[clamp(0.2rem,1cqw,0.35rem)] flex h-[clamp(1rem,4cqw,1.25rem)] w-[clamp(1rem,4cqw,1.25rem)] items-center justify-center rounded-md bg-red-500 text-[clamp(0.55rem,2.2cqw,0.7rem)] font-bold text-white">
                          !
                        </span>
                      )}
                    </div>
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
                )
              })}
            </div>
          )}
        </div>

        {selectedStep && <StepDetailPanel step={selectedStep} />}

        {isUnsaved ? (
          <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2.5">
            <p className="text-[11px] leading-snug text-amber-900">
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
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-800">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            {lastRun?.mode === 'playwright'
              ? t('monitoringFromThisRun')
              : t('liveMonitoringActive')}
          </div>
        )}
      </div>
    </>
  )

  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
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
      {body}
    </section>
  )
}

function StepDetailPanel({ step }: { step: LastRunStepMetric }) {
  const { t, tf } = useLocale()
  const isFailed = step.status === 'failed'
  const statusLabel = isFailed ? t('statusFailing') : t('statusOk')

  return (
    <div className="mt-3 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/80 dark:bg-zinc-900">
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

      <div className="mt-3 overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
        {step.screenshotDataUrl ? (
          <img
            src={step.screenshotDataUrl}
            alt={t('browserScreenshotAlt')}
            className="aspect-video w-full object-cover object-top"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-xs text-zinc-400">
            —
          </div>
        )}
      </div>
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
