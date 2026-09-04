/**
 * Auto-advance explicit download journeys — no menu-path / exact-title stalls.
 */

import type { SiteExploreResult } from './exploreSite.js'
import { shouldSkipJourneyChooser } from './discoverySiteIntent.js'
import {
  downloadSubjectFromIntent,
  findObservedDownloadCta,
  isDownloadOutcomeIntent,
  isDownloadStallText,
  type ObservedDownloadCta,
} from './downloadCtaGrounding.js'
import type { JourneyContext } from './journeyContext.js'
import { resolveJourneyContext } from './journeyContext.js'
import { synthesizePlanFromContext } from './planSynthesis.js'

function inferCtaFromIntent(
  stated: string,
  destinationUrl: string | null,
): ObservedDownloadCta | null {
  const subject = downloadSubjectFromIntent(stated)
  if (!subject) return null
  const label = /^download\b/i.test(subject.trim())
    ? subject.trim()
    : `Download ${subject.replace(/^(the|la|le)\s+/i, '')}`
  return {
    label,
    pageUrl: destinationUrl ?? '',
    source: 'button',
  }
}

export function finalizeExplicitDownloadJourney(options: {
  parsed: Record<string, unknown>
  stated: string | null
  explore: SiteExploreResult | null
  destinationUrl: string | null
  userMessage: string
  seed?: string | null
  preferredLanguage?: string | null
  journeyCtx?: JourneyContext | null
}): Record<string, unknown> {
  const { stated, explore, destinationUrl, userMessage, seed } = options
  if (!stated || !isDownloadOutcomeIntent(stated)) return options.parsed

  const skipChooser =
    shouldSkipJourneyChooser(userMessage) || shouldSkipJourneyChooser(seed ?? '')
  if (!skipChooser) return options.parsed

  const fr = (options.preferredLanguage ?? 'en') === 'fr'
  let parsed = { ...options.parsed }

  const observedCta = findObservedDownloadCta(explore, stated, destinationUrl)
  const cta = observedCta ?? inferCtaFromIntent(stated, destinationUrl)

  let journeyCtx =
    options.journeyCtx ??
    resolveJourneyContext({
      statedIntent: stated,
      contextUrl: destinationUrl,
      explore,
      preferredLanguage: options.preferredLanguage,
    })

  if (journeyCtx && cta && !journeyCtx.primaryCta) {
    journeyCtx = {
      ...journeyCtx,
      primaryCta: {
        label: cta.label,
        href: cta.href,
        pageUrl: cta.pageUrl,
        source: cta.source,
        score: 80,
        role: 'download',
      },
      highConfidence: Boolean(journeyCtx.destinationUrl && journeyCtx.skipHomepageDetour),
    }
  }

  const msg = typeof parsed.message === 'string' ? parsed.message : ''
  if (isDownloadStallText(msg)) {
    parsed.message = cta
      ? fr
        ? `Voici le plan pour télécharger « ${cta.label.replace(/^download\s+/i, '')} » sur la page indiquée.`
        : `Here is the plan to download via “${cta.label}” on the page you shared.`
      : fr
        ? 'Voici le plan de téléchargement pour la page indiquée.'
        : 'Here is the download journey for the page you shared.'
  }

  if (Array.isArray(parsed.questions)) {
    const filtered = parsed.questions.filter(
      (q) => !q || typeof q !== 'object' || !isDownloadStallText(String((q as { prompt?: unknown }).prompt ?? '')),
    )
    parsed.questions = filtered.length > 0 ? filtered : null
  }

  const canSynthesize = Boolean(journeyCtx?.highConfidence || (cta && destinationUrl))
  if (canSynthesize && journeyCtx && !parsed.readyForPlan) {
    const synthCtx: JourneyContext = journeyCtx.highConfidence
      ? journeyCtx
      : { ...journeyCtx, highConfidence: true, primaryCta: journeyCtx.primaryCta ?? (cta ? {
          label: cta.label,
          href: cta.href,
          pageUrl: cta.pageUrl,
          source: cta.source,
          score: 75,
          role: 'download' as const,
        } : null) }
    const steps = synthesizePlanFromContext(synthCtx, explore)
    if (steps) {
      const title = fr ? 'Téléchargement du document' : 'Document download'
      parsed = {
        ...parsed,
        plan: { title, steps },
        readyForPlan: true,
        proposals: null,
        questions: null,
      }
    }
  }

  return parsed
}
