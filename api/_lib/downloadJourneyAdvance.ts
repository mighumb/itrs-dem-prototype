/**
 * Auto-advance explicit download journeys — no menu-path / exact-title stalls.
 * Also blocks lead-form / Book-a-demo proxy detours when the destination is a
 * direct download (no form on that page).
 */

import type { SiteExploreResult } from './exploreSite.js'
import { shouldSkipJourneyChooser } from './discoverySiteIntent.js'
import {
  downloadSubjectFromIntent,
  findObservedDownloadCta,
  isDownloadOutcomeIntent,
  isDownloadStallText,
  isLeadFormCollectionQuestion,
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

function downloadPlanMessage(cta: ObservedDownloadCta | null, fr: boolean): string {
  if (cta) {
    return fr
      ? `Voici le plan pour télécharger via « ${cta.label} » sur la page indiquée — clic direct, sans formulaire.`
      : `Here is the plan to download via “${cta.label}” on the page you shared — direct click, no form.`
  }
  return fr
    ? 'Voici le plan de téléchargement pour la page indiquée — clic direct, sans formulaire.'
    : 'Here is the download journey for the page you shared — direct click, no form.'
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
  const { stated, explore, userMessage, seed } = options
  if (!stated || !isDownloadOutcomeIntent(stated)) return options.parsed

  const skipChooser =
    shouldSkipJourneyChooser(userMessage) || shouldSkipJourneyChooser(seed ?? '')
  if (!skipChooser) return options.parsed

  const fr = (options.preferredLanguage ?? 'en') === 'fr'
  let parsed = { ...options.parsed }

  const observedCta = findObservedDownloadCta(explore, stated, options.destinationUrl)
  const cta = observedCta ?? inferCtaFromIntent(stated, options.destinationUrl)

  let journeyCtx =
    options.journeyCtx ??
    resolveJourneyContext({
      statedIntent: stated,
      contextUrl: options.destinationUrl,
      explore,
      preferredLanguage: options.preferredLanguage,
    })

  // Prefer URL from stated intent when analysis/target didn't resolve yet.
  const effectiveDest =
    journeyCtx?.destinationUrl ?? options.destinationUrl ?? cta?.pageUrl ?? null

  if (journeyCtx && cta && !journeyCtx.primaryCta) {
    journeyCtx = {
      ...journeyCtx,
      primaryCta: {
        label: cta.label,
        href: cta.href,
        pageUrl: cta.pageUrl || effectiveDest || '',
        source: cta.source,
        score: 80,
        role: 'download',
      },
      highConfidence: Boolean(effectiveDest && journeyCtx.skipHomepageDetour),
    }
  }

  // Direct download: never keep lead-form / demo-proxy stall copy.
  const msg = typeof parsed.message === 'string' ? parsed.message : ''
  const direct =
    journeyCtx?.pageArchetype === 'direct_download' ||
    (journeyCtx?.outcome === 'download' && !journeyCtx.hasFormEvidence)
  if (isDownloadStallText(msg) || (direct && /lead\s+form|book\s+a\s+demo|form\s+fields|proxy/i.test(msg))) {
    parsed.message = downloadPlanMessage(cta, fr)
  }

  if (Array.isArray(parsed.questions)) {
    const filtered = parsed.questions.filter((q) => {
      if (!q || typeof q !== 'object') return false
      const prompt = String((q as { prompt?: unknown }).prompt ?? '')
      if (isDownloadStallText(prompt)) return false
      if (direct && isLeadFormCollectionQuestion(q as object)) return false
      return true
    })
    parsed.questions = filtered.length > 0 ? filtered : null
  }

  const canSynthesize = Boolean(
    journeyCtx &&
      (journeyCtx.highConfidence || (cta && effectiveDest)) &&
      (journeyCtx.primaryCta || cta),
  )

  if (canSynthesize && journeyCtx) {
    const primary =
      journeyCtx.primaryCta ??
      (cta
        ? {
            label: cta.label,
            href: cta.href,
            pageUrl: cta.pageUrl || effectiveDest || '',
            source: cta.source,
            score: 75,
            role: 'download' as const,
          }
        : null)

    const synthCtx: JourneyContext = {
      ...journeyCtx,
      destinationUrl: journeyCtx.destinationUrl ?? effectiveDest,
      highConfidence: true,
      primaryCta: primary,
      // Force direct when destination has no form evidence.
      pageArchetype:
        journeyCtx.hasFormEvidence && journeyCtx.pageArchetype === 'gated_download'
          ? 'gated_download'
          : journeyCtx.pageArchetype === 'direct_download' || !journeyCtx.hasFormEvidence
            ? 'direct_download'
            : journeyCtx.pageArchetype,
    }

    const steps = synthesizePlanFromContext(synthCtx, explore)
    if (steps) {
      const title = fr ? 'Téléchargement du document' : 'Document download'
      const summary = fr
        ? 'Ouvrir la page, cliquer sur le bouton de téléchargement, vérifier le succès.'
        : 'Open the page, click the download button, verify success.'
      const prompt =
        stated.length > 400 ? `${stated.slice(0, 397)}…` : stated
      parsed = {
        ...parsed,
        message: downloadPlanMessage(cta, fr),
        plan: { title, summary, steps, prompt },
        readyForPlan: true,
        proposals: null,
        questions: null,
      }
    }
  }

  return parsed
}
