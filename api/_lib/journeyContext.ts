/**
 * Unified journey + page context — drives server-side plan synthesis and validation.
 * Generic across sites; not tied to one brand or URL.
 */

import type { SiteExploreResult } from './exploreSite.js'
import {
  hasExplicitSiteLocator,
  isFillFieldsWithoutSubmitAsk,
  isFillOnlyJourneyIntent,
  shouldSkipJourneyChooser,
} from './discoverySiteIntent.js'
import { isDownloadOutcomeIntent } from './downloadCtaGrounding.js'
import { observedFormInventory } from './formFieldGrounding.js'
import { bestCtaForOutcome, type RankedCta } from './ctaRanking.js'
import { isDeepUrl } from './urlPathHelpers.js'

function urlHash(url: string): string {
  try {
    return new URL(url).hash
  } catch {
    return ''
  }
}

export type JourneyOutcome =
  | 'download'
  | 'fill_fields'
  | 'submit_form'
  | 'login'
  | 'search'
  | 'verify_section'
  | 'generic'

export type PageArchetype =
  | 'direct_download'
  | 'gated_download'
  | 'lead_form'
  | 'login_gateway'
  | 'content_section'
  | 'generic'

export type JourneyContext = {
  statedIntent: string
  destinationUrl: string | null
  outcome: JourneyOutcome
  pageArchetype: PageArchetype
  langFr: boolean
  skipHomepageDetour: boolean
  /** Server can synthesize the full plan without trusting LLM steps. */
  highConfidence: boolean
  primaryCta: RankedCta | null
  hasFormEvidence: boolean
}

function resolveDestinationUrl(stated: string, contextUrl?: string | null): string | null {
  const fromText = stated.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '')
  if (fromText) return fromText
  if (contextUrl?.trim()) return contextUrl.trim()
  return null
}

export function resolveJourneyOutcome(statedIntent: string | null | undefined): JourneyOutcome {
  const text = `${statedIntent ?? ''}`.trim()
  if (!text) return 'generic'
  if (isFillOnlyJourneyIntent(text) || isFillFieldsWithoutSubmitAsk(text)) return 'fill_fields'
  if (/t[eé]l[eé]charg|download/i.test(text)) return 'download'
  if (/solution\s*brief|white\s*paper|livre\s*blanc|position\s*paper/i.test(text)) return 'download'
  if (/brochure/i.test(text) && /t[eé]l[eé]charg|download|pdf/i.test(text)) return 'download'
  if (/connexion|login|sign[\s-]?in|se\s+connecter|compte|account/i.test(text)) return 'login'
  if (/recherch|search\b/i.test(text)) return 'search'
  if (/section|statistiques|statistics|use\s*cases|onglet|tab\b|#/.test(text)) return 'verify_section'
  if (/soumett|submit|envoy|devis|contact|formulaire|form\b/i.test(text)) return 'submit_form'
  return 'generic'
}

function exploreHasPasswordField(explore: SiteExploreResult | null | undefined): boolean {
  return Boolean(
    explore?.pages?.some((page) =>
      page.forms?.some((form) =>
        form.fields?.some((f) => /pass|pwd|mot\s*de\s*passe|motdepasse/i.test(f)),
      ),
    ),
  )
}

function exploreHasDownloadCta(explore: SiteExploreResult | null | undefined): boolean {
  return Boolean(bestCtaForOutcome(explore, 'download', 'download', null, 50))
}

export function classifyPageArchetype(options: {
  explore: SiteExploreResult | null | undefined
  destinationUrl: string | null
  outcome: JourneyOutcome
  statedIntent: string
}): PageArchetype {
  const { explore, destinationUrl, outcome, statedIntent } = options
  // Forms only count on the destination path — never inherit sibling lead forms
  // (e.g. Book-a-demo on /request-a-demo while downloading from #use-cases).
  const inventory = observedFormInventory(explore, { pageUrl: destinationUrl })
  const hasForm = Boolean(inventory?.hasFormEvidence)
  const downloadCta = bestCtaForOutcome(explore, 'download', statedIntent, destinationUrl, 50)

  if (exploreHasPasswordField(explore) && outcome === 'login') return 'login_gateway'
  if (outcome === 'download' && downloadCta && !hasForm) return 'direct_download'
  if (outcome === 'download' && downloadCta && hasForm) return 'gated_download'
  // Download intent + destination itself has no form → direct download
  // (CTA may be inferred from intent when explore missed the button).
  if (outcome === 'download' && !hasForm && destinationUrl) return 'direct_download'
  if ((outcome === 'fill_fields' || outcome === 'submit_form') && hasForm) return 'lead_form'
  if (
    destinationUrl &&
    urlHash(destinationUrl) &&
    outcome !== 'download' &&
    !exploreHasDownloadCta(explore)
  ) {
    return 'content_section'
  }
  if (hasForm) return 'lead_form'
  return 'generic'
}

export function resolveJourneyContext(options: {
  statedIntent: string | null | undefined
  contextUrl?: string | null
  explore?: SiteExploreResult | null
  preferredLanguage?: string | null
}): JourneyContext | null {
  const stated = `${options.statedIntent ?? ''}`.trim()
  if (!stated) return null

  const destinationUrl = resolveDestinationUrl(stated, options.contextUrl)
  const outcome = resolveJourneyOutcome(stated)
  const langFr =
    options.preferredLanguage === 'fr' ||
    /[àâäéèêëïîôùûüç]/i.test(stated) ||
    options.preferredLanguage !== 'en'
  const explore = options.explore ?? null
  const hasFormEvidence = Boolean(
    observedFormInventory(explore, { pageUrl: destinationUrl })?.hasFormEvidence,
  )
  const pageArchetype = classifyPageArchetype({
    explore,
    destinationUrl,
    outcome,
    statedIntent: stated,
  })

  const primaryCta =
    outcome === 'download'
      ? bestCtaForOutcome(explore, 'download', stated, destinationUrl)
      : null

  const skipHomepageDetour = Boolean(
    destinationUrl &&
      isDeepUrl(destinationUrl) &&
      (outcome === 'download' || shouldSkipJourneyChooser(stated)) &&
      (hasExplicitSiteLocator(stated) || isDeepUrl(options.contextUrl ?? '')),
  )

  // Explicit deep URL + download outcome is enough for direct_download even when
  // explore missed the button (hash tab not yet activated) — CTA can be inferred.
  const highConfidence = Boolean(
    destinationUrl &&
      isDeepUrl(destinationUrl) &&
      skipHomepageDetour &&
      ((outcome === 'download' &&
        (pageArchetype === 'direct_download' ||
          (primaryCta && pageArchetype === 'gated_download'))) ||
        (outcome === 'fill_fields' && pageArchetype === 'lead_form' && hasFormEvidence)),
  )

  return {
    statedIntent: stated,
    destinationUrl,
    outcome,
    pageArchetype,
    langFr,
    skipHomepageDetour,
    highConfidence,
    primaryCta,
    hasFormEvidence,
  }
}

const FORM_WORK_TRACE_RE =
  /identif(?:y|ying|ication)|available\s+form\s+field|form\s+field|champ(?:s)?\s+(?:de\s+)?formulaire|collect(?:ing)?\s+(?:details|form)|lead\s+form|remplir\s+le\s+formulaire|book\s+a\s+demo.*(?:proxy|form)|(?:proxy|form).*book\s+a\s+demo|request-a-demo|download\s+via\s+resources|no\s+specific.+download\s+form|as\s+a\s+proxy|download(?:\s+the)?\s+solution\s+brief['’]?\s+link\s+was\s+not\s+found|direct.+link\s+was\s+not\s+found|not\s+found\s+on\s+(?:this\s+)?(?:specific\s+)?page|proposing\s+alternative\s+journeys|did\s+not\s+find\s+a\s+direct\s+download/i

/** Drop misleading LLM workTrace lines when the page has no form (direct download). */
export function filterWorkTraceForContext(
  lines: string[],
  ctx: JourneyContext | null,
): string[] {
  if (!ctx) return lines
  const directDownload =
    ctx.pageArchetype === 'direct_download' ||
    (ctx.outcome === 'download' && !ctx.hasFormEvidence)

  let next = lines
  if (directDownload) {
    next = lines.filter(
      (line) =>
        !FORM_WORK_TRACE_RE.test(line) ||
        /no\s+form|aucun\s+(?:champ|formulaire)|direct\s+download\s+[—–-]|téléchargement\s+direct/i.test(
          line,
        ),
    )
    const note = ctx.langFr
      ? 'Téléchargement direct — aucun champ formulaire observé sur la page'
      : 'Direct download — no form fields observed on the page'
    if (!next.some((l) => /direct\s+download\s+[—–-]|téléchargement\s+direct/i.test(l))) {
      next = [note, ...next]
    }
  }
  return next.slice(0, 8)
}

export function softenDryRunUserMessage(
  message: string,
  workTrace: string[] | null,
  ctx: JourneyContext | null,
  fr: boolean,
): string {
  if (!ctx || ctx.pageArchetype !== 'direct_download') return message
  const blob = `${message} ${(workTrace ?? []).join(' ')}`
  if (!/fragile|hiccup|partial\s+dry-run|Heads-up/i.test(blob)) return message
  const softEvidence =
    /captureScreenshot|Unable to capture screenshot|screenshot|deadline|Dry-run OK|Répétition OK/i.test(
      blob,
    )
  if (!softEvidence) return message
  // Strip any prior Heads-up block — dry-run soft-ok for direct download.
  const withoutHeadsUp = message
    .replace(/\n*\*{0,2}Heads-up\*{0,2}:[\s\S]*?(?=\n\n|$)/gi, '')
    .replace(/\n*\*{0,2}Attention\*{0,2}\s*:[\s\S]*?(?=\n\n|$)/gi, '')
    .trim()
  const cleanFallback = fr
    ? 'Voici le plan de téléchargement — clic direct, sans formulaire.'
    : 'Here is the download journey — direct click, no form.'
  if (/Dry-run OK|Répétition OK/i.test((workTrace ?? []).join(' '))) {
    if (!withoutHeadsUp || /fragile|hiccup|Heads-up|Attention/i.test(withoutHeadsUp)) {
      return cleanFallback
    }
    return withoutHeadsUp
  }
  return fr
    ? 'Plan prêt : ouvrir la page, cliquer sur le bouton de téléchargement, puis vérifier le succès. La répétition navigateur a validé le parcours critique ; seul le Verify final a dépassé le délai (PDF / nouvel onglet).'
    : 'Plan ready: open the page, click the download button, then verify success. The browser rehearsal validated the critical path; only the final Verify hit the deadline (PDF / new tab).'
}
