import type { LastRunSnapshot, LastRunStepMetric } from '../types'
import { formatAvailabilityPercent, formatFailingStepsLabel } from '../mock/data'
import type { Locale } from '../i18n/messages'

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function computeLastRunKpi(
  lastRun: LastRunSnapshot | null,
  locale: Locale = 'en',
): {
  availability: string
  totalTime: string
  failingSteps: string
} {
  if (!lastRun || lastRun.steps.length === 0) {
    return { availability: '—', totalTime: '—', failingSteps: '—' }
  }

  const doneCount = lastRun.steps.filter((s) => s.status === 'done').length
  const failedCount = lastRun.steps.filter((s) => s.status === 'failed').length
  const totalMs = lastRun.steps.reduce((sum, s) => sum + Math.max(0, s.durationMs), 0)

  return {
    availability: formatAvailabilityPercent(doneCount, lastRun.steps.length),
    totalTime: formatDurationMs(totalMs),
    failingSteps: formatFailingStepsLabel(failedCount, locale),
  }
}

export function upsertLastRunStep(
  steps: LastRunStepMetric[],
  metric: LastRunStepMetric,
): LastRunStepMetric[] {
  const next = steps.filter((s) => s.index !== metric.index && s.stepId !== metric.stepId)
  next.push(metric)
  next.sort((a, b) => a.index - b.index)
  return next
}
