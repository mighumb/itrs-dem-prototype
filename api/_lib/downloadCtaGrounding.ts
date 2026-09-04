/**
 * When siteExplore already lists a download CTA, never ask the user
 * “how is it usually downloaded?” — ground on the observed button/link.
 */

import type { SiteExploreResult } from './exploreSite.js'
import type { GuardProposal } from './proposalIntentGuard.js'
import { shouldSkipJourneyChooser } from './discoverySiteIntent.js'
import { observedFormInventory } from './formFieldGrounding.js'
import { bestCtaForOutcome } from './ctaRanking.js'

export type ObservedDownloadCta = {
  label: string
  href?: string
  pageUrl: string
  source: 'button' | 'link'
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isDownloadOutcomeIntent(text: string | null | undefined): boolean {
  const t = `${text ?? ''}`.trim()
  if (!t) return false
  return /t[eé]l[eé]charg|download|solution\s*brief|white\s*paper|livre\s*blanc|brochure|position\s*paper|pdf/i.test(
    t,
  )
}

/** Subject noun phrase after “download …” (e.g. “the solution brief”). */
export function downloadSubjectFromIntent(intent: string): string | null {
  const cleaned = intent
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m =
    cleaned.match(
      /(?:download|t[eé]l[eé]charg(?:er)?)\s+(?:the\s+|la\s+|le\s+|l['’])?(.+?)(?:\.|$)/i,
    ) ?? cleaned.match(/(?:solution\s*brief|white\s*paper|livre\s*blanc|brochure)/i)
  const subject = m?.[1]?.trim() ?? m?.[0]?.trim()
  return subject && subject.length >= 4 && subject.length <= 80 ? subject : null
}

/** Find the best matching download button/link from explore inventory. */
export function findObservedDownloadCta(
  explore: SiteExploreResult | null | undefined,
  statedIntent: string,
  destinationUrl?: string | null,
): ObservedDownloadCta | null {
  const ranked = bestCtaForOutcome(explore, 'download', statedIntent, destinationUrl)
  if (!ranked) return null
  return {
    label: ranked.label,
    href: ranked.href,
    pageUrl: ranked.pageUrl,
    source: ranked.source,
  }
}

export function isDownloadMethodClarificationQuestion(q: {
  prompt?: unknown
  options?: unknown
}): boolean {
  const prompt = String(q.prompt ?? '')
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o)).join(' ')
    : ''
  return isDownloadStallText(`${prompt} ${options}`)
}

/** Stall copy when URL + download outcome already given — menu path, exact title, etc. */
export function isDownloadStallText(text: string): boolean {
  const blob = `${text ?? ''}`
  return (
    /how\s+is\s+.+\s+(?:usually\s+)?downloaded|clarify\s+download|download\s+method|usually\s+downloaded/i.test(
      blob,
    ) ||
    /comment\s+.+\s+t[eé]l[eé]charg|m[eé]thode\s+de\s+t[eé]l[eé]chargement|habituellement\s+t[eé]l[eé]charg/i.test(
      blob,
    ) ||
    /filling\s+out\s+a\s+form\s+on\s+the\s+site|direct\s+link\s+on\s+another\s+page|not\s+sure.*suggest\s+a\s+path/i.test(
      blob,
    ) ||
    /en\s+remplissant\s+un\s+formulaire|lien\s+direct\s+sur\s+une\s+autre\s+page|je\s+ne\s+sais\s+pas.*sugg[eè]re/i.test(
      blob,
    ) ||
    /exact\s+title\s+of\s+the\s+document|menu\s+path|navigation\s+path|path\s+to\s+find\s+it|where\s+(?:in\s+the\s+menu|to\s+find)/i.test(
      blob,
    ) ||
    /titre\s+exact|chemin\s+(?:de\s+)?navigation|menu\s+pour\s+le\s+trouver|où\s+le\s+trouver\s+dans/i.test(
      blob,
    ) ||
    /provide\s+the\s+exact\s+title|please\s+provide.*(?:title|path|menu)/i.test(blob) ||
    // Lead-form / Book-a-demo proxy detour when user asked for a direct download.
    /fills?\s+out\s+a\s+(?:standard\s+)?lead\s+form|prepare\s+a\s+journey\s+that\s+fills|provide\s+the\s+details.+(?:for\s+the\s+)?form|lead\s+form\s+details/i.test(
      blob,
    ) ||
    /book\s+a\s+demo.+(?:proxy|form)|(?:proxy|form).+book\s+a\s+demo|request-a-demo|download\s+via\s+resources/i.test(
      blob,
    ) ||
    /remplir\s+(?:un\s+)?(?:formulaire\s+de\s+)?(?:lead|contact|d[eé]mo)|details?\s+(?:du|de)\s+formulaire|proxy.+d[eé]mo/i.test(
      blob,
    )
  )
}

/** Form-param questions (name/email/…) are stalls for direct-download journeys. */
export function isLeadFormCollectionQuestion(q: {
  prompt?: unknown
  options?: unknown
}): boolean {
  const prompt = String(q.prompt ?? '')
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o)).join(' ')
    : ''
  const blob = `${prompt} ${options}`
  return (
    /(?:first\s*name|last\s*name|pr[eé]nom|nom|email|e-?mail|phone|t[eé]l[eé]phone|company|soci[eé]t[eé]|job\s*title|poste)/i.test(
      blob,
    ) ||
    /details?\s+(?:you.?d\s+like\s+to\s+use\s+)?(?:for\s+the\s+)?form|lead\s+form|form\s+fields?\s+to\s+(?:use|fill)/i.test(
      blob,
    ) ||
    /quelles?\s+(?:sont\s+les\s+)?(?:valeurs|donn[eé]es).+formulaire|renseigne.+formulaire/i.test(
      blob,
    )
  )
}

export function synthesizeObservedDownloadProposal(
  cta: ObservedDownloadCta,
  statedIntent: string,
  destination: string | null,
  fr: boolean,
  explore?: SiteExploreResult | null,
): GuardProposal {
  const dest = destination ?? cta.pageUrl
  const hasForm = Boolean(
    observedFormInventory(explore, { pageUrl: dest })?.hasFormEvidence,
  )
  return {
    id: 'observed-download-cta',
    title: fr ? `Télécharger via « ${cta.label} »` : `Download via “${cta.label}”`,
    description: hasForm
      ? fr
        ? `Ouvrir ${dest}, remplir le formulaire observé, puis cliquer sur « ${cta.label} ».`
        : `Open ${dest}, fill the observed form, then click “${cta.label}”.`
      : fr
        ? `Ouvrir ${dest} et cliquer sur le bouton observé « ${cta.label} » (téléchargement direct).`
        : `Open ${dest} and click the observed “${cta.label}” button (direct download).`,
    prompt:
      statedIntent.length > 400
        ? `${statedIntent.slice(0, 397)}…`
        : `${statedIntent} — click « ${cta.label} » (observed on the page).`,
  }
}

export function applyDownloadCtaGrounding(options: {
  stated: string | null
  explore: SiteExploreResult | null
  destinationUrl: string | null
  proposals: unknown
  questions: unknown
  userMessage: string
  seed?: string | null
  preferredLanguage?: string | null
}): { proposals: unknown; questions: unknown } {
  const { stated, explore, destinationUrl, userMessage, seed } = options
  let { proposals, questions } = options
  if (!stated || !isDownloadOutcomeIntent(stated)) {
    return { proposals, questions }
  }

  const fr = (options.preferredLanguage ?? 'en') === 'fr'
  const skipChooser =
    shouldSkipJourneyChooser(userMessage) || shouldSkipJourneyChooser(seed ?? '')

  if (Array.isArray(questions)) {
    const filtered = questions.filter(
      (q) =>
        !q ||
        typeof q !== 'object' ||
        (!isDownloadMethodClarificationQuestion(q as object) &&
          !(skipChooser && isLeadFormCollectionQuestion(q as object))),
    )
    questions = filtered.length > 0 ? filtered : null
  }

  const cta = findObservedDownloadCta(explore, stated, destinationUrl)
  if (cta) {
    const observedProposal = synthesizeObservedDownloadProposal(
      cta,
      stated,
      destinationUrl,
      fr,
      explore,
    )
    if (skipChooser || !proposals || !Array.isArray(proposals) || proposals.length === 0) {
      proposals = [observedProposal]
      questions = null
    } else {
      const rest = proposals.filter(
        (p) =>
          p &&
          typeof p === 'object' &&
          !/observed-download-cta/.test(String((p as { id?: string }).id ?? '')),
      )
      proposals = [observedProposal, ...rest].slice(0, 3)
    }
  } else if (skipChooser && Array.isArray(questions) && questions.length > 0 && !proposals) {
    // User gave URL + download outcome — don't stall on “how do you download?” without a CTA.
    questions = null
  }

  return { proposals, questions }
}
