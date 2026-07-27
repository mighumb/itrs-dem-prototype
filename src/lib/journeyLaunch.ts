import { t, tf, type Locale } from '../i18n/messages'
import type { DiscoveryPlan } from '../mock/discovery'
import type {
  BrowserFrame,
  ChatMessage,
  JourneyMonitoringPreview,
  JourneyStep,
  JourneyTemplate,
} from '../types'

/** Full Discovery → workspace handoff (not just a prompt string). */
export type JourneyLaunchSession = {
  prompt: string
  messages: ChatMessage[]
  plan: DiscoveryPlan | null
  /** Resolved / inspected site URL from Discovery when known */
  siteUrl: string | null
}

export function extractUrlFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  return match?.[0]?.replace(/[.,);]+$/g, '') ?? null
}

function normalizeAction(action: string, label: string): string {
  const blob = `${action} ${label}`.toLowerCase()
  if (
    /navigate|go to|open url|va sur|ouvre https?|ouvrir https?/i.test(blob) ||
    extractUrlFromText(label) ||
    extractUrlFromText(action)
  ) {
    return 'Navigate'
  }
  if (/type|fill|sais|recherch|search|enter|entrer|renseign/i.test(blob)) return 'Type'
  if (/click|select|choose|choisis|sélectionne|clique|ouvre\b/i.test(blob)) return 'Click'
  if (/verify|vérif|check|confirm|attendre|wait/i.test(blob)) return 'Verify'
  return action.trim() || 'Click'
}

function genericMonitoring(name: string, locale: Locale = 'en'): JourneyMonitoringPreview {
  return {
    kpi: { availability: '—', totalTime: '—', failingSteps: t(locale, 'zeroIssues') },
    alertTitle: t(locale, 'stepFailureDetected'),
    alertMessage: tf(locale, 'stepsFailedInRun', { count: 1, name }),
  }
}

/** Hostname (or short label) for a site URL — used in "title - url" chrome. */
export function shortSiteLabel(url: string | null | undefined): string | null {
  if (!url || url === 'about:blank') return null
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null
  } catch {
    const trimmed = url.trim()
    return trimmed || null
  }
}

function looksLikeBareUrlOrHost(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (/^https?:\/\//i.test(v)) return true
  // bare hostname like amazon.fr / www.amazon.fr
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(v)) return true
  return false
}

/**
 * Workspace / header title: "Journey name - site".
 * Never show a bare URL as the only title.
 */
export function formatJourneyTitle(
  name: string,
  url?: string | null,
  locale: Locale = 'en',
): string {
  const site = shortSiteLabel(url)
  const generic = locale === 'fr' ? 'Parcours' : 'Journey'
  let clean = name.trim() || generic

  if (looksLikeBareUrlOrHost(clean)) {
    clean = generic
  }

  // Avoid "Parcours - amazon.fr - amazon.fr" if name already ends with site
  if (site && clean.toLowerCase().endsWith(` - ${site.toLowerCase()}`)) {
    return clean
  }
  if (site) return `${clean} - ${site}`
  return clean
}

/** Prefer a human prompt as the journey name; fall back to hostname only if needed. */
export function journeyNameFromSeed(
  prompt: string,
  url?: string | null,
  locale: Locale = 'en',
): string {
  const trimmed = prompt.trim()
  const site = url ?? extractUrlFromText(trimmed)
  const withoutUrl = trimmed.replace(/https?:\/\/[^\s<>"']+/gi, '').replace(/\s+/g, ' ').trim()
  if (withoutUrl.length >= 3 && !looksLikeBareUrlOrHost(withoutUrl)) {
    return withoutUrl.slice(0, 72)
  }
  if (site) {
    // Keep a real name slot — display layer adds " - host"
    return locale === 'fr' ? 'Parcours' : 'Journey'
  }
  return trimmed.slice(0, 48) || (locale === 'fr' ? 'Parcours' : 'Journey')
}

function framesForSteps(
  steps: Omit<JourneyStep, 'status'>[],
  seedUrl: string | null,
): BrowserFrame[] {
  return steps.map((step) => ({
    url: step.target?.startsWith('http') ? step.target : (seedUrl ?? 'about:blank'),
    title: step.label,
    highlight: step.label,
  }))
}

/**
 * Build a runnable workspace journey from the Discovery plan (source of truth for Playwright).
 */
export function buildJourneyFromDiscovery(options: {
  plan: DiscoveryPlan
  prompt: string
  siteUrl?: string | null
  locale?: Locale
}): JourneyTemplate {
  const { plan, prompt, siteUrl, locale = 'en' } = options
  const seedUrl =
    siteUrl ??
    extractUrlFromText(plan.prompt) ??
    extractUrlFromText(prompt) ??
    extractUrlFromText(plan.steps.map((s) => s.label).join(' '))

  const steps: Omit<JourneyStep, 'status'>[] = plan.steps.map((step, index) => {
    const action = normalizeAction(step.action, step.label)
    const urlInStep =
      step.href ??
      extractUrlFromText(step.label) ??
      extractUrlFromText(step.action)
    const target =
      action === 'Navigate'
        ? (urlInStep ?? seedUrl ?? undefined)
        : urlInStep ?? undefined

    return {
      id: `discovery-${index + 1}`,
      label: step.label,
      action,
      duration: index === 0 ? '3.5s' : '800ms',
      target,
      targetHint: step.targetHint,
      href: step.href ?? (target?.startsWith('http') ? target : undefined),
      timeout: '30s',
    }
  })

  // Guarantee at least one Navigate target when we know the site URL.
  if (seedUrl && steps.length > 0 && !steps.some((s) => s.action === 'Navigate' && (s.target || s.href))) {
    const first = steps[0]!
    steps[0] = {
      ...first,
      action: 'Navigate',
      target: seedUrl,
      href: seedUrl,
      label: first.label.match(/https?:\/\//i)
        ? first.label
        : tf(locale, 'openUrl', { url: seedUrl }),
    }
  }

  const name =
    (plan.title && !looksLikeBareUrlOrHost(plan.title) ? plan.title.trim() : null) ||
    journeyNameFromSeed(prompt, seedUrl, locale)

  return {
    id: 'discovery-plan',
    name,
    steps,
    browserFrames: framesForSteps(steps, seedUrl),
    monitoring: genericMonitoring(name, locale),
  }
}

/**
 * Minimal journey when only a prompt/URL is known (no Discovery plan yet).
 * Playwright still targets that site — never a hard-coded demo brand.
 */
export function buildJourneyFromPrompt(
  prompt: string,
  siteUrl?: string | null,
  locale: Locale = 'en',
): JourneyTemplate {
  const url = siteUrl ?? extractUrlFromText(prompt)
  const name = journeyNameFromSeed(prompt, url, locale)
  const steps: Omit<JourneyStep, 'status'>[] = url
    ? [
        {
          id: 'prompt-1',
          label: tf(locale, 'openUrl', { url }),
          action: 'Navigate',
          duration: '3.5s',
          target: url,
          timeout: '30s',
        },
        {
          id: 'prompt-2',
          label: t(locale, 'verifyPageLoaded'),
          action: 'Verify',
          duration: '500ms',
          target: 'body',
          timeout: '30s',
        },
      ]
    : []

  return {
    id: 'prompt-journey',
    name,
    steps,
    browserFrames: framesForSteps(steps, url),
    monitoring: genericMonitoring(name, locale),
  }
}

export function agentIntroForLocale(locale: 'en' | 'fr'): ChatMessage {
  return {
    id: 'intro',
    role: 'agent',
    content:
      locale === 'fr'
        ? 'Bonjour — je suis l’assistant ITRS DEM. Dis-moi quoi surveiller, ou colle une URL pour commencer.'
        : "Hello! I'm the ITRS DEM assistant. Tell me what to monitor, or paste a URL to get started.",
  }
}

export function runStartMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr'
    ? 'Compris. Je lance ce parcours dans un vrai navigateur Playwright — regarde les captures à droite.'
    : "Got it. I'll run this journey in a real Playwright browser — watch the screenshots on the right."
}

export function runStoppedMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr' ? 'Exécution arrêtée.' : 'Run stopped.'
}

export function runLiveOkMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr'
    ? 'Run Playwright terminé — les captures ci-dessus sont de vraies pages.'
    : 'Playwright run finished — screenshots above are real page captures.'
}

export function runFallbackMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr'
    ? 'Runner Playwright indisponible — repli sur des captures simulées pour ce run.'
    : 'Playwright runner unavailable — falling back to simulated browser frames for this run.'
}
