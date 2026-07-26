import type { RecordedBrowserStep } from './extensionBridge'
import type { JourneyStep } from '../types'

/** Turn extension-recorded actions into workspace journey steps. */
export function recordedStepsToJourneySteps(recorded: RecordedBrowserStep[]): JourneyStep[] {
  const out: JourneyStep[] = []
  let lastNav = ''

  for (const step of recorded) {
    const action = normalizeAction(step.action)
    if (action === 'Navigate') {
      const href = step.href || step.url
      if (!href || href === lastNav) continue
      lastNav = href
      out.push({
        id: step.id || `rec-nav-${out.length + 1}`,
        label: step.label?.trim() || href,
        action: 'Navigate',
        status: 'pending',
        target: href,
        href,
        targetHint: step.targetHint || step.label,
        timeout: '30s',
        duration: out.length === 0 ? '3.5s' : '800ms',
      })
      continue
    }

    out.push({
      id: step.id || `rec-${out.length + 1}`,
      label: step.label?.trim() || action,
      action,
      status: 'pending',
      target: step.selector,
      href: step.href,
      targetHint: step.targetHint || step.label,
      timeout: '30s',
      duration: '800ms',
    })
  }

  return out.slice(0, 40)
}

function normalizeAction(action: string): string {
  const a = action.trim().toLowerCase()
  if (a === 'navigate' || a === 'open') return 'Navigate'
  if (a === 'type' || a === 'fill') return 'Type'
  if (a === 'verify' || a === 'check') return 'Verify'
  return 'Click'
}

export function recordingTitle(recorded: RecordedBrowserStep[], fallback = 'Recorded journey'): string {
  const nav = recorded.find((s) => s.action === 'Navigate' && (s.href || s.url))
  const url = nav?.href || nav?.url
  if (!url) return fallback
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return fallback
  }
}
