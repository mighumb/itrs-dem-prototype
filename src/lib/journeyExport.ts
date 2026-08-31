import type { JourneyAction, LastRunSnapshot } from '../types'
import { computeLastRunKpi } from './runMonitoring'
import type { Locale } from '../i18n/messages'

export type JourneyExportStep = {
  n: number
  id: string
  action: string
  label: string
  target?: string | null
  href?: string | null
  targetHint?: string | null
}

export type JourneyExportDocument = {
  title: string
  url: string | null
  steps: JourneyExportStep[]
}

export type RunReportExportStep = {
  n: number
  stepId: string
  label: string
  status: 'done' | 'failed'
  durationMs: number
  url?: string | null
  title?: string | null
  error?: string | null
  screenshotDataUrl?: string | null
}

export type RunReportExportDocument = {
  exportType: 'run-report'
  title: string
  url: string | null
  run: {
    mode: 'playwright'
    finishedAt: number
    finishedAtIso: string
  }
  summary: {
    availability: string
    totalTime: string
    failingSteps: string
  }
  steps: RunReportExportStep[]
}

function exportSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'journey'
  )
}

export function buildJourneyExportDocument(
  title: string,
  url: string | null | undefined,
  steps: Pick<JourneyAction, 'id' | 'action' | 'label' | 'target' | 'href' | 'targetHint'>[],
): JourneyExportDocument {
  return {
    title,
    url: url ?? null,
    steps: steps.map((step, index) => ({
      n: index + 1,
      id: step.id,
      action: step.action,
      label: step.label,
      target: step.target ?? null,
      href: step.href ?? null,
      targetHint: step.targetHint ?? null,
    })),
  }
}

export function serializeJourneyExport(
  title: string,
  url: string | null | undefined,
  steps: Pick<JourneyAction, 'id' | 'action' | 'label' | 'target' | 'href' | 'targetHint'>[],
): string {
  return JSON.stringify(buildJourneyExportDocument(title, url, steps), null, 2)
}

export function journeyExportFilename(title: string): string {
  return `${exportSlug(title)}-steps.json`
}

export function buildRunReportExportDocument(
  title: string,
  url: string | null | undefined,
  lastRun: LastRunSnapshot,
  locale: Locale,
): RunReportExportDocument {
  const summary = computeLastRunKpi(lastRun, locale)
  return {
    exportType: 'run-report',
    title,
    url: url ?? null,
    run: {
      mode: lastRun.mode,
      finishedAt: lastRun.finishedAt,
      finishedAtIso: new Date(lastRun.finishedAt).toISOString(),
    },
    summary,
    steps: lastRun.steps.map((step, index) => ({
      n: index + 1,
      stepId: step.stepId,
      label: step.label,
      status: step.status,
      durationMs: step.durationMs,
      url: step.url ?? null,
      title: step.title ?? null,
      error: step.error ?? null,
      screenshotDataUrl: step.screenshotDataUrl ?? null,
    })),
  }
}

export function serializeRunReportExport(
  title: string,
  url: string | null | undefined,
  lastRun: LastRunSnapshot,
  locale: Locale,
): string {
  return JSON.stringify(buildRunReportExportDocument(title, url, lastRun, locale), null, 2)
}

export function runReportExportFilename(title: string): string {
  return `${exportSlug(title)}-run-report.json`
}

export function downloadTextFile(filename: string, body: string, mimeType = 'application/json') {
  const blob = new Blob([body], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
