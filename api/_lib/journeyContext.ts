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
  const inventory = observedFormInventory(explore)
  const hasForm = Boolean(inventory?.hasFormEvidence)
  const downloadCta = bestCtaForOutcome(explore, 'download', statedIntent, destinationUrl, 50)

  if (exploreHasPasswordField(explore) && outcome === 'login') return 'login_gateway'
  if (outcome === 'download' && downloadCta && !hasForm) return 'direct_download'
  if (outcome === 'download' && downloadCta && hasForm) return 'gated_download'
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
  const hasFormEvidence = Boolean(observedFormInventory(explore)?.hasFormEvidence)
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

  const highConfidence = Boolean(
    destinationUrl &&
      isDeepUrl(destinationUrl) &&
      skipHomepageDetour &&
      ((outcome === 'download' &&
        primaryCta &&
        (pageArchetype === 'direct_download' || pageArchetype === 'gated_download')) ||
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
