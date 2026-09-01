import type { JourneyAction, LastRunSnapshot } from '../types'
import { computeLastRunKpi } from './runMonitoring'
import type { Locale } from '../i18n/messages'
import type { RecordedBrowserStep } from './extensionBridge'

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

function normalizeExportStep(raw: unknown, index: number): JourneyExportStep | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.label !== 'string' || typeof s.action !== 'string') return null
  const id = typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `import-${index + 1}`
  return {
    n: typeof s.n === 'number' ? s.n : index + 1,
    id,
    action: s.action.trim(),
    label: s.label.trim(),
    target: typeof s.target === 'string' ? s.target : null,
    href: typeof s.href === 'string' ? s.href : null,
    targetHint: typeof s.targetHint === 'string' ? s.targetHint : null,
  }
}

/** Parse journey export JSON (file body or ```json block). */
export function parseJourneyExportDocument(raw: string): JourneyExportDocument | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const jsonText = fenced || trimmed
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const doc = data as Record<string, unknown>
  const stepsRaw = Array.isArray(doc.steps) ? doc.steps : null
  if (!stepsRaw || stepsRaw.length === 0) return null
  const steps = stepsRaw
    .map((step, index) => normalizeExportStep(step, index))
    .filter((s): s is JourneyExportStep => s != null)
  if (steps.length === 0) return null
  const title =
    typeof doc.title === 'string' && doc.title.trim() ? doc.title.trim().slice(0, 80) : 'Recorded journey'
  const url = typeof doc.url === 'string' && /^https?:\/\//i.test(doc.url) ? doc.url : null
  return { title, url, steps }
}

export function journeyExportToRecordedSteps(doc: JourneyExportDocument): RecordedBrowserStep[] {
  return doc.steps.map((step, index) => ({
    id: step.id || `import-${index + 1}`,
    action: step.action,
    label: step.label,
    url: doc.url ?? step.href ?? '',
    href: step.href ?? undefined,
    targetHint: step.targetHint ?? undefined,
    selector: step.target ?? undefined,
    at: Date.now() + index,
  }))
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
