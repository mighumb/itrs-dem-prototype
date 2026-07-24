import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import { buildMonitoringPreviewSteps, computeRunMonitoringKpi, getStepMonitoringMetrics } from '../mock/data'
import type { JourneyMonitoringPreview, JourneyStep, StepMonitoringMetrics } from '../types'

interface MonitoringColumnProps {
  isUnsaved?: boolean
  journeyName: string
  steps: JourneyStep[]
  monitoring: JourneyMonitoringPreview
  onClose: () => void
  onSave: () => void
  embedded?: boolean
}

export default function MonitoringColumn({
  isUnsaved,
  journeyName,
  steps,
  monitoring,
  onClose,
  onSave,
  embedded,
}: MonitoringColumnProps) {
  const { t, tf, locale } = useLocale()
  const previewSteps = buildMonitoringPreviewSteps(steps)
  const [selectedStepId, setSelectedStepId] = useState(previewSteps[0]?.id ?? '')

  const failedCount = previewSteps.filter((s) => s.status === 'failed').length
  const kpi = computeRunMonitoringKpi(steps, locale)
  const showAlert = failedCount > 0
  const alertTitle = monitoring.alertTitle ?? t('stepFailureDetected')
  const alertMessage =
    monitoring.alertMessage ?? tf('stepsFailedInRun', { count: failedCount })

  useEffect(() => {
    if (!previewSteps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(previewSteps[0]?.id ?? '')
    }
  }, [previewSteps, selectedStepId])

  const selectedIndex = previewSteps.findIndex((step) => step.id === selectedStepId)
  const selectedStep = selectedIndex >= 0 ? previewSteps[selectedIndex] : previewSteps[0]
  const selectedOriginalIndex = selectedStep
    ? steps.findIndex((step) => step.id === selectedStep.id)
    : -1
  const selectedMetrics =
    selectedStep && selectedOriginalIndex >= 0
      ? getStepMonitoringMetrics(selectedStep, selectedOriginalIndex, steps, locale)
      : null
  const hasUnrunSteps = steps.some((step) => step.status === 'pending')

  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {showAlert && (
          <div className="mb-4 flex gap-2 rounded-xl border border-red-200/80 bg-red-50/90 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <div className="text-xs">
              <p className="font-medium text-red-900">{alertTitle}</p>
              <p className="mt-0.5 text-red-800/80">{alertMessage}</p>
            </div>
          </div>
        )}

        <h2 className="mb-3 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{journeyName}</h2>

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
          {previewSteps.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-400">
              {t('noExecutedSteps')}
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {previewSteps.map((step) => {
              const isSelected = step.id === selectedStepId
              const isFailed = step.status === 'failed'
              const stepNumber = steps.findIndex((s) => s.id === step.id) + 1

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelectedStepId(step.id)}
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
                </button>
              )
            })}
            </div>
          )}
        </div>

        {hasUnrunSteps && previewSteps.length > 0 && (
          <p className="mt-2 text-[11px] text-zinc-400">
            {t('newStepsAppear')}
          </p>
        )}

        {selectedStep && selectedMetrics && selectedOriginalIndex >= 0 && (
          <StepDetailPanel
            step={selectedStep}
            stepIndex={selectedOriginalIndex}
            metrics={selectedMetrics}
          />
        )}
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
            {t('liveMonitoringActive')}
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

function StepDetailPanel({
  step,
  stepIndex,
  metrics,
}: {
  step: JourneyStep
  stepIndex: number
  metrics: StepMonitoringMetrics
}) {
  const { t, tf } = useLocale()
  return (
    <div className="mt-3 rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700/80 dark:bg-zinc-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {tf('stepN', { n: stepIndex + 1 })}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.label}</p>
        </div>
        <StatusBadge status={metrics.status} label={metrics.statusLabel} />
      </div>

      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
        {t('whatWeMeasured')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <ExperienceMetric
          label={t('stepDuration')}
          value={metrics.stepDuration}
          hint={t('stepDurationHint')}
        />
        {metrics.readyForUser && (
          <ExperienceMetric
            label={t('readyForUser')}
            value={metrics.readyForUser}
            hint={t('readyForUserHint')}
          />
        )}
        {metrics.mainContentVisible && (
          <ExperienceMetric
            label={t('mainContentVisible')}
            value={metrics.mainContentVisible}
            hint={t('mainContentVisibleHint')}
          />
        )}
        {metrics.pageFullyLoaded && (
          <ExperienceMetric
            label={t('pageFullyLoaded')}
            value={metrics.pageFullyLoaded}
            hint={t('pageFullyLoadedHint')}
          />
        )}
        <ExperienceMetric
          label={t('visualStability')}
          value={metrics.layoutStability}
          hint={t('visualStabilityHint')}
        />
      </div>

      {metrics.insight && (
        <p
          className={`mt-3 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed ${
            metrics.status === 'failing'
              ? 'bg-red-50 text-red-800'
              : 'bg-amber-50 text-amber-900'
          }`}
        >
          {metrics.insight}
        </p>
      )}
    </div>
  )
}

function ExperienceMetric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-2.5 dark:border-zinc-700 dark:bg-zinc-800/60">
      <p className="text-[10px] font-medium text-zinc-600">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-zinc-400">{hint}</p>
    </div>
  )
}

function StatusBadge({
  status,
  label,
}: {
  status: StepMonitoringMetrics['status']
  label: string
}) {
  const styles = {
    ok: 'bg-emerald-50 text-emerald-700',
    degraded: 'bg-amber-50 text-amber-700',
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
