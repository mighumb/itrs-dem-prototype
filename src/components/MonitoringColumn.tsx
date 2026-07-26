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

        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/40">
          {runSteps.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-400">{t('noExecutedSteps')}</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {runSteps.map((step) => {
                const isSelected = step.stepId === selectedStepId
                const isFailed = step.status === 'failed'
                const stepNumber = step.index + 1

                return (
                  <button
                    key={step.stepId}
                    type="button"
                    onClick={() => setSelectedStepId(step.stepId)}
                    className={`flex w-[4.5rem] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition ${
                      isSelected
                        ? 'border-[#0071e3] bg-[#0071e3]/8 ring-2 ring-[#0071e3]/25'
                        : isFailed
                          ? 'border-red-200 bg-red-50/60 hover:border-red-300'
                          : 'border-zinc-100 bg-zinc-50 hover:border-zinc-300 hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
                        isFailed
                          ? 'bg-red-100 text-red-600'
                          : isSelected
                            ? 'bg-[#0071e3] text-white'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isFailed ? '!' : stepNumber}
                    </span>
                    <span
                      className={`line-clamp-2 text-[9px] leading-tight ${
                        isSelected ? 'font-medium text-[#0071e3]' : 'text-zinc-500'
                      }`}
                    >
                      {step.label.split(' ').slice(0, 2).join(' ')}
                    </span>
                    <span className="text-[9px] tabular-nums text-zinc-400">
                      {formatDurationMs(step.durationMs)}
                    </span>
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

      {step.screenshotDataUrl && (
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-700">
          <img
            src={step.screenshotDataUrl}
            alt={t('browserScreenshotAlt')}
            className="max-h-40 w-full object-cover object-top"
          />
        </div>
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
