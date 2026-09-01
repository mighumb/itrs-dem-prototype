import type { Locale } from '../i18n/messages'
import type { JourneyAction, JourneyStage } from '../types'
import type { RecordedBrowserStep } from './extensionBridge'
import { actionsToStages } from './journeyStages'

/** Turn extension-recorded gestures into flat journey actions. */
export function recordedStepsToJourneySteps(recorded: RecordedBrowserStep[]): JourneyAction[] {
  const out: JourneyAction[] = []
  let lastNav = ''

  for (const step of recorded) {
    const action = normalizeAction(step.action)
    if (action === 'Navigate') {
      const href = step.href || step.url
      if (!href || href === lastNav) continue
      // History noise from SPA/back — rarely useful for replay.
      if (/\((?:popstate|pushState|replaceState)\)/i.test(step.label ?? '')) continue
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

  return out
}

/** Default: 1 recorded action → 1 stage (Étape N / Stage N). */
export function recordedStepsToJourneyStages(
  recorded: RecordedBrowserStep[],
  locale: Locale = 'en',
): JourneyStage[] {
  return actionsToStages(recordedStepsToJourneySteps(recorded), locale)
}

function normalizeAction(action: string): string {
  const a = action.trim().toLowerCase()
  if (a === 'navigate' || a === 'open') return 'Navigate'
  if (a === 'type' || a === 'fill') return 'Type'
  if (a === 'verify' || a === 'check') return 'Verify'
  return 'Click'
}

export function recordingTitle(recorded: RecordedBrowserStep[], fallback = 'Recorded journey'): string {
  const trimmed = fallback.trim()
  // Keep an existing human journey name (not a bare host/URL).
  if (
    trimmed &&
    trimmed !== 'Recorded journey' &&
    !/^https?:\/\//i.test(trimmed) &&
    !/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(trimmed)
  ) {
    return trimmed.slice(0, 72)
  }

  const nav = recorded.find((s) => s.action === 'Navigate' && (s.href || s.url))
  const pageTitle = nav?.label?.trim() || nav?.targetHint?.trim()
  if (
    pageTitle &&
    !/^https?:\/\//i.test(pageTitle) &&
    pageTitle.length >= 3 &&
    !/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(pageTitle)
  ) {
    return pageTitle.slice(0, 72)
  }

  return trimmed || 'Recorded journey'
}

/** Site URL from a recording (for "title - url" chrome). */
export function recordingSiteUrl(recorded: RecordedBrowserStep[]): string | null {
  const nav = recorded.find((s) => s.action === 'Navigate' && (s.href || s.url))
  const url = nav?.href || nav?.url
  return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
}
