/**
 * When siteExplore already lists a download CTA, never ask the user
 * “how is it usually downloaded?” — ground on the observed button/link.
 */

import type { SiteExploreResult } from './exploreSite.js'
import type { GuardProposal } from './proposalIntentGuard.js'
import { shouldSkipJourneyChooser } from './discoverySiteIntent.js'

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

function scoreDownloadCta(label: string, subject: string | null): number {
  const n = normalizeText(label)
  if (!/download|t[eé]l[eé]charg|brief|brochure|white\s*paper|livre\s*blanc|pdf|solution/.test(n)) {
    return 0
  }
  let score = 40
  if (/^download\b|^t[eé]l[eé]charg/.test(n)) score += 20
  if (subject) {
    const words = normalizeText(subject)
      .split(' ')
      .filter((w) => w.length > 2)
    const hits = words.filter((w) => n.includes(w)).length
    score += hits * 25
    if (hits === words.length && words.length > 0) score += 30
  }
  return score
}

/** Find the best matching download button/link from explore inventory. */
export function findObservedDownloadCta(
  explore: SiteExploreResult | null | undefined,
  statedIntent: string,
  destinationUrl?: string | null,
): ObservedDownloadCta | null {
  if (!explore?.ok || !explore.pages?.length) return null
  const subject = downloadSubjectFromIntent(statedIntent)
  const destKey = destinationUrl
    ? normalizeText(destinationUrl.replace(/#.*$/, '').split('?')[0] ?? '')
    : ''

  let best: (ObservedDownloadCta & { score: number }) | null = null

  for (const page of explore.pages) {
    const pageKey = normalizeText(page.url.replace(/#.*$/, '').split('?')[0] ?? '')
    const onDestination = Boolean(destKey && pageKey && pageKey.includes(destKey.split('/').slice(-2).join('/')))

    for (const label of page.buttons ?? []) {
      const score = scoreDownloadCta(label, subject) + (onDestination ? 15 : 0)
      if (score < 55) continue
      if (!best || score > best.score) {
        best = { label, pageUrl: page.url, source: 'button', score }
      }
    }
    for (const link of page.links ?? []) {
      const score = scoreDownloadCta(link.label, subject) + (onDestination ? 15 : 0)
      if (score < 55) continue
      if (!best || score > best.score) {
        best = {
          label: link.label,
          href: link.href,
          pageUrl: page.url,
          source: 'link',
          score,
        }
      }
    }
  }

  if (!best) return null
  const { score: _score, ...cta } = best
  return cta
}

export function isDownloadMethodClarificationQuestion(q: {
  prompt?: unknown
  options?: unknown
}): boolean {
  const prompt = String(q.prompt ?? '')
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o)).join(' ')
    : ''
  const blob = `${prompt} ${options}`
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
    )
  )
}

export function synthesizeObservedDownloadProposal(
  cta: ObservedDownloadCta,
  statedIntent: string,
  destination: string | null,
  fr: boolean,
): GuardProposal {
  const dest = destination ?? cta.pageUrl
  return {
    id: 'observed-download-cta',
    title: fr ? `Télécharger via « ${cta.label} »` : `Download via “${cta.label}”`,
    description: fr
      ? `Ouvrir ${dest}, cliquer sur le bouton observé « ${cta.label} », puis compléter le formulaire si un gated download s’affiche.`
      : `Open ${dest}, click the observed “${cta.label}” control, then complete the form if a gated download appears.`,
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
      (q) => !q || typeof q !== 'object' || !isDownloadMethodClarificationQuestion(q as object),
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
