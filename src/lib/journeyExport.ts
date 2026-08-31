import type { JourneyAction } from '../types'

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
  const safeName = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${safeName || 'journey'}-steps.json`
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
