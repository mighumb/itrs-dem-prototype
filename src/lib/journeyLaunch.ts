import { t, tf, type Locale } from '../i18n/messages'
import type { DiscoveryPlan } from '../mock/discovery'
import type {
  BrowserFrame,
  ChatMessage,
  JourneyAction,
  JourneyMonitoringPreview,
  JourneyTemplate,
  JourneyTemplateStage,
} from '../types'
import { actionsToStages } from './journeyStages'

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

/** Exported for regression checks — Click “Lancer la recherche” must stay Click. */
export function normalizeAction(action: string, label: string): string {
  const act = action.trim().toLowerCase()
  const blob = `${action} ${label}`.toLowerCase()

  // Explicit plan actions win (LLM already chose Click vs Type).
  if (act === 'click') return 'Click'
  if (act === 'type' || act === 'search' || act === 'fill') return 'Type'
  if (act === 'navigate') return 'Navigate'
  if (act === 'verify' || act === 'wait') return 'Verify'

  if (
    /navigate|go to|open url|va sur|ouvre https?|ouvrir https?/i.test(blob) ||
    extractUrlFromText(label) ||
    extractUrlFromText(action)
  ) {
    return 'Navigate'
  }
  // Submit-search phrasing is a Click, not a Type (avoids typing “Lancer la recherche”).
  if (/lancer\s+la\s+recherch|submit\s+(the\s+)?search/i.test(label)) return 'Click'
  // Type only for fill/type verbs — not bare “recherch*” (that matches Click labels).
  if (/\b(type|taper|tape|fill|sais|renseign)\b/i.test(blob)) return 'Type'
  if (/^(search|rechercher)\b/i.test(label.trim()) && /[«"']/.test(label)) return 'Type'
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

function framesForActions(
  actions: Omit<JourneyAction, 'status'>[],
  seedUrl: string | null,
): BrowserFrame[] {
  return actions.map((action) => ({
    url: action.target?.startsWith('http') ? action.target : (seedUrl ?? 'about:blank'),
    title: action.label,
    highlight: action.label,
  }))
}

function stagesFromActions(
  actions: Omit<JourneyAction, 'status'>[],
  locale: Locale = 'en',
): JourneyTemplateStage[] {
  return actionsToStages(actions, locale).map((stage) => ({
    id: stage.id,
    title: stage.title,
    actions: stage.actions.map(({ status: _status, ...action }) => action),
  }))
}

function isConsentLabel(label: string): boolean {
  return /cookie|bandeau|consent|rgpd|gdpr|didomi|sans accepter|tout accepter|tout refuser|accepte?r les cookies/i.test(
    label,
  )
}

function isFormTypeLabel(label: string): boolean {
  return /\b(nom|pr[eé]nom|e-?mail|t[eé]l[eé]phone|phone|champ)\b/i.test(label)
}

function looksLikeFormOpenClick(label: string): boolean {
  return /brochure|contact|devis|demo|essai|lead|formulaire|télécharg|download|inscription|signup|sign[- ]?up/i.test(
    label,
  )
}

/**
 * Natural-path guard: after homepage Navigate, form Type steps need a Click that
 * opens the form (e.g. « Brochure ») — otherwise the runner types on the home page.
 */
export function ensureFormEntryBeforeTypes(
  actions: Array<Omit<JourneyAction, 'status'>>,
  options?: { siteUrl?: string | null; prompt?: string; locale?: Locale },
): Array<Omit<JourneyAction, 'status'>> {
  if (actions.length < 2) return actions

  const firstTypeIdx = actions.findIndex(
    (a) => a.action === 'Type' && isFormTypeLabel(a.label),
  )
  if (firstTypeIdx < 0) return actions

  const before = actions.slice(0, firstTypeIdx)
  if (before.some((a) => a.action === 'Click' && looksLikeFormOpenClick(a.label))) {
    return actions
  }
  // Already navigates to a deep form URL — no CTA click needed.
  if (
    before.some((a) => {
      if (a.action !== 'Navigate') return false
      const href = a.href ?? a.target ?? ''
      return /\/(brochure|contact|demo|devis|lead|form)/i.test(href)
    })
  ) {
    return actions
  }

  const locale = options?.locale ?? 'en'
  const blob = `${options?.prompt ?? ''} ${options?.siteUrl ?? ''} ${actions.map((a) => a.label).join(' ')}`
  let cta: string | null = null
  if (/\/brochure|brochure/i.test(blob)) cta = 'Brochure'
  else if (/\/contact|contact/i.test(blob)) cta = 'Contact'
  else if (/devis/i.test(blob)) cta = 'Devis'
  else if (/demo|essai/i.test(blob)) cta = locale === 'fr' ? 'Demander une démo' : 'Request a demo'
  if (!cta) return actions

  const navIdx = before.findIndex((a) => a.action === 'Navigate')
  let at = Math.max(1, navIdx >= 0 ? navIdx + 1 : 1)
  while (at < firstTypeIdx && isConsentLabel(actions[at]?.label ?? '')) at += 1

  const clickStep: Omit<JourneyAction, 'status'> = {
    id: 'discovery-form-entry',
    label:
      locale === 'fr'
        ? `Cliquer sur « ${cta} » pour ouvrir le formulaire`
        : `Click « ${cta} » to open the form`,
    action: 'Click',
    duration: '800ms',
    targetHint: cta,
    timeout: '30s',
  }

  const next = [...actions.slice(0, at), clickStep, ...actions.slice(at)]
  next.forEach((step, index) => {
    step.id = `discovery-${index + 1}`
  })
  return next
}

/** Patch a Discovery plan so chat + Steps match the runnable form-entry guard. */
export function ensureFormEntryInPlan(
  plan: DiscoveryPlan,
  options?: { siteUrl?: string | null; prompt?: string; locale?: Locale },
): DiscoveryPlan {
  const actions: Array<Omit<JourneyAction, 'status'>> = plan.steps.map((step, index) => {
    const action = normalizeAction(step.action, step.label)
    return {
      id: `discovery-${index + 1}`,
      label: step.label,
      action,
      duration: '800ms',
      target: step.href,
      targetHint: step.targetHint,
      href: step.href,
      timeout: '30s',
    }
  })
  const fixed = ensureFormEntryBeforeTypes(actions, {
    siteUrl: options?.siteUrl ?? null,
    prompt: `${options?.prompt ?? ''} ${plan.prompt} ${plan.title}`,
    locale: options?.locale,
  })
  if (
    fixed.length === plan.steps.length &&
    fixed.every((a, i) => {
      const s = plan.steps[i]!
      return (
        a.label === s.label &&
        a.action === normalizeAction(s.action, s.label) &&
        (a.href ?? undefined) === (s.href ?? undefined)
      )
    })
  ) {
    return plan
  }
  return {
    ...plan,
    steps: fixed.map((a) => {
      const step: DiscoveryPlan['steps'][number] = {
        label: a.label,
        action: a.action,
      }
      if (a.targetHint) step.targetHint = a.targetHint
      if (a.href) step.href = a.href
      return step
    }),
  }
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
  const { prompt, siteUrl, locale = 'en' } = options
  const seedUrl =
    siteUrl ??
    extractUrlFromText(options.plan.prompt) ??
    extractUrlFromText(prompt) ??
    extractUrlFromText(options.plan.steps.map((s) => s.label).join(' '))
  const plan = ensureFormEntryInPlan(options.plan, {
    siteUrl: seedUrl,
    prompt,
    locale,
  })

  const actions: Omit<JourneyAction, 'status'>[] = plan.steps.map((step, index) => {
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

  // Keep at most one cookie/CMP step — duplicates after later navigations confuse the run.
  let sawConsent = false
  const dedupedActions = actions.filter((step) => {
    if (!isConsentLabel(step.label)) return true
    if (sawConsent) return false
    sawConsent = true
    return true
  })
  let finalActions = dedupedActions.length > 0 ? dedupedActions : actions
  // Re-id after transforms so timeline stays contiguous.
  finalActions.forEach((step, index) => {
    step.id = `discovery-${index + 1}`
  })

  // Guarantee at least one Navigate target when we know the site URL.
  if (
    seedUrl &&
    finalActions.length > 0 &&
    !finalActions.some((s) => s.action === 'Navigate' && (s.target || s.href))
  ) {
    const first = finalActions[0]!
    finalActions[0] = {
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
    stages: stagesFromActions(finalActions, locale),
    browserFrames: framesForActions(finalActions, seedUrl),
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
  const actions: Omit<JourneyAction, 'status'>[] = url
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
    stages: stagesFromActions(actions, locale),
    browserFrames: framesForActions(actions, url),
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
    ? 'Compris. Je lance ce parcours dans le navigateur — regarde les captures à droite.'
    : "Got it. I'll run this journey in the browser — watch the screenshots on the right."
}

export function runStoppedMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr' ? 'Exécution arrêtée.' : 'Run stopped.'
}

export function runLiveOkMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr'
    ? 'Run terminé — les captures ci-dessus sont de vraies pages.'
    : 'Run finished — screenshots above are real page captures.'
}

export function runFallbackMessage(locale: 'en' | 'fr'): string {
  return locale === 'fr'
    ? 'Navigateur indisponible — repli sur des captures simulées pour ce run.'
    : 'Browser runner unavailable — falling back to simulated frames for this run.'
}
