/**
 * Ground Discovery plan steps against observed siteExplore inventory.
 * Auto-fills targetHint/href when labels match real links/buttons.
 */

import type { SiteExploreResult } from './exploreSite.js'
import { canonicalSiteUrlFromText } from './discoverySiteIntent.js'
import {
  homepageOf,
  isDeepUrl,
  queryFromDeepUrl,
  stripLocaleSearchNoiseSteps,
} from './urlPathHelpers.js'

export type GroundedPlanStep = {
  label: string
  action: string
  targetHint?: string
  href?: string
}

export { homepageOf, isDeepUrl, queryFromDeepUrl, stripLocaleSearchNoiseSteps } from './urlPathHelpers.js'

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractQuoted(label: string): string | null {
  return label.match(/"([^"]+)"/)?.[1] ?? label.match(/«\s*([^»]+)\s*»/)?.[1] ?? null
}

function inventoryIndex(explore: SiteExploreResult) {
  const links: Array<{ label: string; href: string; norm: string }> = []
  const buttons: string[] = []
  for (const page of explore.pages) {
    for (const link of page.links) {
      links.push({
        label: link.label,
        href: link.href,
        norm: normalizeText(link.label),
      })
    }
    for (const button of page.buttons) {
      buttons.push(button)
    }
  }
  return { links, buttons: buttons.map((b) => ({ raw: b, norm: normalizeText(b) })) }
}

function bestLinkMatch(
  needle: string,
  links: Array<{ label: string; href: string; norm: string }>,
) {
  const n = normalizeText(needle)
  if (!n || n.length < 2) return null
  let best: { label: string; href: string; score: number } | null = null
  for (const link of links) {
    let score = 0
    if (link.norm === n) score = 100
    else if (link.norm.includes(n) || n.includes(link.norm)) score = 70
    else if (n.split(' ').some((w) => w.length > 3 && link.norm.includes(w))) score = 40
    if (score > 0 && (!best || score > best.score)) {
      best = { label: link.label, href: link.href, score }
    }
  }
  return best && best.score >= 40 ? best : null
}

/**
 * Enrich steps with targetHint/href from explore evidence when possible.
 */
export function enrichPlanStepsFromExplore(
  steps: GroundedPlanStep[],
  explore: SiteExploreResult | null,
): GroundedPlanStep[] {
  if (!explore?.ok || explore.pages.length === 0) return steps
  const { links, buttons } = inventoryIndex(explore)

  return steps.map((step) => {
    const next: GroundedPlanStep = { ...step }
    const quoted = extractQuoted(step.label)
    const action = step.action.toLowerCase()

    if (!next.targetHint && quoted) {
      next.targetHint = quoted
    }

    const hint = next.targetHint ?? quoted
    if (hint) {
      const link = bestLinkMatch(hint, links)
      if (link) {
        if (!next.targetHint) next.targetHint = link.label
        if (!next.href) next.href = link.href
      } else {
        const button = buttons.find(
          (b) => b.norm === normalizeText(hint) || b.norm.includes(normalizeText(hint)),
        )
        if (button && !next.targetHint) next.targetHint = button.raw
      }
    }

    // Navigate steps: prefer an observed URL in the label.
    // If that URL is a deep link, prefer the site homepage (deep link = destination, not entry).
    if ((/navigate|go to|open/i.test(action) || /https?:\/\//i.test(step.label)) && !next.href) {
      const urlMatch = step.label.match(/https?:\/\/[^\s"'<>]+/i)?.[0]
      if (urlMatch) {
        const cleaned = urlMatch.replace(/[.,);]+$/g, '')
        next.href = isDeepUrl(cleaned) ? homepageOf(cleaned) : cleaned
      } else if (explore.pages[0]?.url) {
        const pageUrl = explore.pages[0].url
        next.href = isDeepUrl(pageUrl) ? homepageOf(pageUrl) : pageUrl
      } else {
        const fromLabel = canonicalSiteUrlFromText(
          step.label,
          preferFrLabels(steps) ? 'fr' : 'en',
        )
        if (fromLabel) next.href = fromLabel
      }
    }

    // Click without hint: try to pull a strong noun phrase against inventory.
    if (!next.href && !next.targetHint && /click|select|choose|choisis|ouvre/i.test(action)) {
      const cleaned = step.label
        .replace(/^(click|select|choose|open|choisis|sélectionne|ouvre|clique)\s+/i, '')
        .split(/\s+and\b/i)[0]
        ?.trim()
      if (cleaned) {
        const link = bestLinkMatch(cleaned, links)
        if (link) {
          next.targetHint = link.label
          next.href = link.href
        }
      }
    }

    return next
  })
}

/** Path beyond `/`, query, or hash → deep link (destination, not entry). */
// isDeepUrl / homepageOf / queryFromDeepUrl live in urlPathHelpers (shared).

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** Human label from URL hash (e.g. #Statistiques → Statistiques). */
export function sectionFromHash(url: string): string | null {
  try {
    const raw = new URL(url).hash.replace(/^#/, '').trim()
    if (!raw) return null
    const decoded = decodeURIComponent(raw)
      .replace(/[_+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return decoded.length >= 2 ? decoded : null
  } catch {
    return null
  }
}

function planMentionsSection(steps: GroundedPlanStep[], section: string): boolean {
  const needle = section.toLowerCase()
  return steps.some((step) => {
    const blob = `${step.label} ${step.targetHint ?? ''} ${step.href ?? ''}`.toLowerCase()
    return blob.includes(needle)
  })
}

/** Ensure a Click (+ optional Verify retarget) for a hash/section destination. */
function ensureSectionDepth(
  steps: GroundedPlanStep[],
  destination: string,
  langFr: boolean,
): GroundedPlanStep[] {
  const section = sectionFromHash(destination)
  if (!section || planMentionsSection(steps, section)) return steps

  const click: GroundedPlanStep = {
    action: 'Click',
    label: langFr ? `Ouvrir la section « ${section} »` : `Open the "${section}" section`,
    targetHint: section,
  }

  const withoutTrailingVerify = [...steps]
  let trailingVerify: GroundedPlanStep | null = null
  const last = withoutTrailingVerify[withoutTrailingVerify.length - 1]
  if (last && /verify|vérif|check/i.test(`${last.action} ${last.label}`)) {
    trailingVerify = withoutTrailingVerify.pop() ?? null
  }

  const verify: GroundedPlanStep = trailingVerify
    ? {
        ...trailingVerify,
        label: langFr
          ? `Vérifier la section « ${section} »`
          : `Verify the "${section}" section`,
        targetHint: trailingVerify.targetHint || section,
      }
    : {
        action: 'Verify',
        label: langFr
          ? `Vérifier la section « ${section} »`
          : `Verify the "${section}" section`,
        targetHint: section,
      }

  return [...withoutTrailingVerify, click, verify].slice(0, 8)
}

/**
 * Login gateway guard: before Type email/password, require a Click that opens
 * the credential form (e.g. « Connexion », « Je me connecte ») when explore
 * never saw a password field on the landing page.
 */
export function ensureLoginGatewayBeforeCredentials(
  steps: GroundedPlanStep[],
  explore: SiteExploreResult | null,
): GroundedPlanStep[] {
  if (steps.length < 2) return steps

  const firstCredIdx = steps.findIndex((step) => {
    if (!/type|fill|search/i.test(step.action) && !/^(type|taper|tape|sais)/i.test(step.label)) {
      return false
    }
    return /e-?mail|mail\b|mot\s*de\s*passe|password|passwd|\bpwd\b/i.test(
      `${step.label} ${step.targetHint ?? ''}`,
    )
  })
  if (firstCredIdx < 0) return steps

  const before = steps.slice(0, firstCredIdx)
  if (
    before.some((step) =>
      /click|cliquer/i.test(`${step.action} ${step.label}`) &&
      /connexion|login|sign[- ]?in|se\s+connecter|je\s+me\s+connecte|mon\s+compte|account/i.test(
        step.label,
      ),
    )
  ) {
    return steps
  }
  // Already navigates straight into a page that explore shows has a password field.
  const exploreHasPassword = Boolean(
    explore?.pages?.some((page) =>
      page.forms.some((form) =>
        form.fields.some((field) => /pass|pwd|mot\s*de\s*passe|motdepasse/i.test(field)),
      ),
    ),
  )
  if (exploreHasPassword) return steps

  const { buttons, links } = inventoryIndex(
    explore ?? {
      ok: false,
      method: 'none',
      pagesVisited: 0,
      pages: [],
      title: null,
      url: '',
      reason: null,
      snapshot: null,
    },
  )
  const loginCta =
    buttons.find((b) =>
      /connexion|je\s+me\s+connecte|se\s+connecter|sign\s*in|log\s*in|mon\s+compte/i.test(b.raw),
    )?.raw ??
    links.find((l) =>
      /connexion|login|sign[- ]?in|account/i.test(`${l.label} ${l.href}`),
    )?.label ??
    null

  // Prefer an observed CTA; otherwise a generic Connexion click still beats typing blind.
  const cta = loginCta || (preferFrLabels(steps) ? 'Connexion' : 'Log in')
  const langFr = preferFrLabels(steps) || /connexion|connecter/i.test(cta)

  const navIdx = before.findIndex(isNavigateAction)
  let at = Math.max(1, navIdx >= 0 ? navIdx + 1 : 1)
  while (
    at < firstCredIdx &&
    /cookie|consent|didomi|rgpd|accepter/i.test(steps[at]?.label ?? '')
  ) {
    at += 1
  }

  const clickStep: GroundedPlanStep = {
    action: 'Click',
    label: langFr
      ? `Cliquer sur « ${cta} » pour ouvrir le formulaire de connexion`
      : `Click « ${cta} » to open the login form`,
    targetHint: cta,
  }
  const linkMatch = links.find((l) => normalizeText(l.label) === normalizeText(cta))
  if (linkMatch?.href) clickStep.href = linkMatch.href

  return [...steps.slice(0, at), clickStep, ...steps.slice(at)].slice(0, 8)
}

function preferFrLabels(steps: GroundedPlanStep[]): boolean {
  return /[àâäéèêëïîôùûüç]/i.test(steps.map((s) => s.label).join(' '))
}

function isNavigateAction(step: GroundedPlanStep): boolean {
  return /navigate|go to|open/i.test(step.action) || /navigate|va sur|ouvre https?/i.test(step.label)
}

function isSearchOrType(step: GroundedPlanStep): boolean {
  const act = step.action.trim().toLowerCase()
  if (act === 'click') return false
  if (act === 'type' || act === 'search' || act === 'fill') return true
  // Label must look like typing a query — not “Lancer la recherche” (submit Click).
  if (/lancer\s+la\s+recherch|submit\s+(the\s+)?search/i.test(step.label)) return false
  return /^(type|search|taper|tape|sais|recherch)/i.test(step.label.trim())
}

function hasTeleportEntry(steps: GroundedPlanStep[], contextUrl?: string | null): string | null {
  const fromContext = contextUrl && isDeepUrl(contextUrl) ? contextUrl : null
  const firstNav = steps.find(isNavigateAction)
  const firstHref = firstNav?.href
  if (firstHref && isDeepUrl(firstHref)) return firstHref
  if (fromContext && firstHref && sameOrigin(firstHref, fromContext) && isDeepUrl(fromContext)) {
    return fromContext
  }
  // Label embeds the deep context URL
  if (fromContext && firstNav && firstNav.label.includes(fromContext)) return fromContext
  return fromContext && steps.length > 0 && isNavigateAction(steps[0]!) ? fromContext : null
}

/**
 * Deep-link URLs are destinations. If the plan teleports to them in step 1
 * without a search/type path, rewrite to homepage → search → open result.
 */
export function naturalizeDeepLinkEntry(
  steps: GroundedPlanStep[],
  contextUrl?: string | null,
): GroundedPlanStep[] {
  if (steps.length === 0) return steps

  // Drop “search/open fr” noise before deciding whether a real search path exists.
  const base = stripLocaleSearchNoiseSteps(steps)

  const destination = hasTeleportEntry(base, contextUrl)
  if (!destination) return base

  // Already has a natural search/type step — only fix the first Navigate href.
  if (base.some(isSearchOrType)) {
    const rewritten = base.map((step, index) => {
      if (index !== 0 && !isNavigateAction(step)) return step
      if (!isNavigateAction(step)) return step
      // First navigate only
      const firstNavIdx = base.findIndex(isNavigateAction)
      if (index !== firstNavIdx) return step
      if (step.href && isDeepUrl(step.href) && sameOrigin(step.href, destination)) {
        const home = homepageOf(destination)
        return {
          ...step,
          href: home,
          label: step.label.replace(step.href, home).replace(destination, home),
        }
      }
      if (!step.href && contextUrl && isDeepUrl(contextUrl)) {
        return { ...step, href: homepageOf(contextUrl) }
      }
      return step
    })
    const langFr = /[àâäéèêëïîôùûüç]/i.test(rewritten.map((s) => s.label).join(' '))
    return ensureSectionDepth(rewritten, destination, langFr)
  }

  const home = homepageOf(destination)
  const query = queryFromDeepUrl(destination)
  const langFr = /[àâäéèêëïîôùûüç]/i.test(base.map((s) => s.label).join(' '))

  const entry: GroundedPlanStep[] = [
    {
      action: 'Navigate',
      label: langFr ? `Ouvrir la page d’accueil` : `Open the homepage`,
      href: home,
    },
  ]
  if (query) {
    entry.push({
      action: 'Type',
      label: langFr ? `Rechercher « ${query} »` : `Search for "${query}"`,
      targetHint: query,
    })
    entry.push({
      action: 'Click',
      label: langFr ? `Ouvrir « ${query} »` : `Open "${query}"`,
      targetHint: query,
    })
  }

  // Drop early Navigate teleports to the same deep URL; keep later click/verify work.
  const rest = base.filter((step) => {
    if (!isNavigateAction(step)) return true
    const href = step.href
    if (href && isDeepUrl(href) && sameOrigin(href, destination)) return false
    if (step.label.includes(destination)) return false
    return true
  })

  // Avoid duplicating a leading verify-only skeleton
  const merged = [...entry, ...rest]
  return ensureSectionDepth(merged, destination, langFr).slice(0, 8)
}

/**
 * Soft warnings when click/navigate steps have no grounding at all.
 */
export function groundingIssues(
  steps: GroundedPlanStep[],
  explore: SiteExploreResult | null,
): string[] {
  if (!explore?.ok || explore.pages.length === 0) return []
  const issues: string[] = []
  steps.forEach((step, index) => {
    const action = step.action.toLowerCase()
    const needsTarget =
      /click|select|choose|navigate|go to|open|choisis|ouvre|clique/i.test(action) ||
      /click|select|navigate|ouvre|clique/i.test(step.label)
    if (!needsTarget) return
    if (step.href || step.targetHint) return
    // Verify/type steps can be ungrounded.
    if (/type|fill|verify|vérif|search|sais|recherch|wait|check/i.test(`${action} ${step.label}`)) {
      return
    }
    issues.push(`Step ${index + 1} ("${step.label}") has no observed targetHint/href`)
  })
  return issues.slice(0, 6)
}

export {
  ensureOutcomeVerify,
  isWeakPageLoadVerify,
  outcomeVerifyFromSteps,
} from './planOutcomeVerify.js'
import { ensureOutcomeVerify } from './planOutcomeVerify.js'

export function applyGroundingToPlan(
  plan: Record<string, unknown>,
  explore: SiteExploreResult | null,
  contextUrl?: string | null,
): { plan: Record<string, unknown>; issues: string[] } {
  if (!plan || typeof plan !== 'object') return { plan, issues: [] }
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : []
  const steps: GroundedPlanStep[] = rawSteps.flatMap((step) => {
    if (!step || typeof step !== 'object') return []
    const s = step as Record<string, unknown>
    if (typeof s.label !== 'string' || typeof s.action !== 'string') return []
    const out: GroundedPlanStep = {
      label: s.label,
      action: s.action,
    }
    if (typeof s.targetHint === 'string') out.targetHint = s.targetHint
    if (typeof s.href === 'string') out.href = s.href
    return [out]
  })

  const seed =
    contextUrl ||
    explore?.pages?.[0]?.url ||
    null
  const enriched = enrichPlanStepsFromExplore(steps, explore)
  const withLoginGateway = ensureLoginGatewayBeforeCredentials(enriched, explore)
  const naturalized = naturalizeDeepLinkEntry(withLoginGateway, seed)
  const cleaned = stripLocaleSearchNoiseSteps(naturalized)
  const withOutcome = ensureOutcomeVerify(cleaned)
  const issues = groundingIssues(withOutcome, explore)
  return {
    plan: { ...plan, steps: withOutcome },
    issues,
  }
}
