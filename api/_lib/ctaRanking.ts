/**
 * Outcome-aware CTA ranking — pick the control that matches the journey goal,
 * not the loudest header CTA (e.g. "Book a demo" vs "Download the solution brief").
 */

import type { SiteExploreResult } from './exploreSite.js'
import { downloadSubjectFromIntent } from './downloadCtaGrounding.js'
import type { JourneyOutcome } from './journeyContext.js'

export type CtaRole = 'download' | 'demo' | 'login' | 'submit' | 'nav' | 'other'

export type RankedCta = {
  label: string
  href?: string
  pageUrl: string
  source: 'button' | 'link'
  score: number
  role: CtaRole
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyCtaRole(label: string): CtaRole {
  const n = normalizeText(label)
  if (/^download\b|^t[eé]l[eé]charg|solution\s*brief|white\s*paper|livre\s*blanc|brochure|position\s*paper|\bpdf\b/.test(n)) {
    return 'download'
  }
  if (/book\s+a\s+demo|request\s+a\s+demo|demo\b|essai|trial|contact\s+us|nous\s+contacter/.test(n)) {
    return 'demo'
  }
  if (/connexion|login|sign\s*in|log\s*in|se\s+connecter|mon\s+compte/.test(n)) {
    return 'login'
  }
  if (/envoyer|submit|valider|send\s+(the\s+)?form|je\s+valide|je\s+t[eé]l[eé]charge/.test(n)) {
    return 'submit'
  }
  if (/solutions?\b|overview|use\s*cases|capabilities|ressources|resources/.test(n)) {
    return 'nav'
  }
  return 'other'
}

function scoreForOutcome(role: CtaRole, outcome: JourneyOutcome): number {
  const matrix: Record<JourneyOutcome, Partial<Record<CtaRole, number>>> = {
    download: { download: 100, submit: 30, nav: 5, demo: -40, login: -20, other: 0 },
    fill_fields: { submit: 40, download: 10, demo: -10, login: -20, nav: 5, other: 0 },
    submit_form: { submit: 100, download: 20, demo: -10, login: -20, nav: 0, other: 0 },
    login: { login: 100, submit: 10, demo: -20, download: -30, nav: 0, other: 0 },
    search: { nav: 20, other: 10, download: 0, demo: 0, login: 0, submit: 0 },
    verify_section: { nav: 50, other: 10, download: 0, demo: -20, login: 0, submit: 0 },
    generic: { other: 10, nav: 10, download: 10, demo: 10, login: 10, submit: 10 },
  }
  return matrix[outcome][role] ?? 0
}

function subjectBoost(label: string, subject: string | null): number {
  if (!subject) return 0
  const n = normalizeText(label)
  const words = normalizeText(subject)
    .split(' ')
    .filter((w) => w.length > 2)
  const hits = words.filter((w) => n.includes(w)).length
  if (hits === 0) return 0
  let score = hits * 22
  if (hits === words.length) score += 28
  return score
}

function onDestinationBoost(pageUrl: string, destinationUrl: string | null | undefined): number {
  if (!destinationUrl) return 0
  const pageKey = normalizeText(pageUrl.replace(/#.*$/, '').split('?')[0] ?? '')
  const destKey = normalizeText(destinationUrl.replace(/#.*$/, '').split('?')[0] ?? '')
  if (!pageKey || !destKey) return 0
  return pageKey.includes(destKey.split('/').slice(-2).join('/')) ? 18 : 0
}

/** Collect and rank all CTAs from explore for a given journey outcome. */
export function rankCtasForOutcome(
  explore: SiteExploreResult | null | undefined,
  outcome: JourneyOutcome,
  statedIntent: string,
  destinationUrl?: string | null,
): RankedCta[] {
  if (!explore?.ok || !explore.pages?.length) return []

  const subject = outcome === 'download' ? downloadSubjectFromIntent(statedIntent) : null
  const ranked: RankedCta[] = []

  for (const page of explore.pages) {
    const destBoost = onDestinationBoost(page.url, destinationUrl)

    for (const label of page.buttons ?? []) {
      const role = classifyCtaRole(label)
      const score =
        scoreForOutcome(role, outcome) + subjectBoost(label, subject) + destBoost + (role === 'download' ? 12 : 0)
      if (score < 40) continue
      ranked.push({ label, pageUrl: page.url, source: 'button', score, role })
    }
    for (const link of page.links ?? []) {
      const role = classifyCtaRole(link.label)
      const score =
        scoreForOutcome(role, outcome) + subjectBoost(link.label, subject) + destBoost
      if (score < 40) continue
      ranked.push({
        label: link.label,
        href: link.href,
        pageUrl: page.url,
        source: 'link',
        score,
        role,
      })
    }
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

export function bestCtaForOutcome(
  explore: SiteExploreResult | null | undefined,
  outcome: JourneyOutcome,
  statedIntent: string,
  destinationUrl?: string | null,
  minScore = 55,
): RankedCta | null {
  const ranked = rankCtasForOutcome(explore, outcome, statedIntent, destinationUrl)
  const best = ranked[0]
  if (!best || best.score < minScore) return null
  if (outcome === 'download' && best.role !== 'download') return null
  return best
}

export function isDemoProposalBlob(blob: string): boolean {
  return /book\s+a\s+demo|request\s+a\s+demo|request-a-demo|demo\s+form|essai\s+gratuit|free\s+trial/i.test(
    blob,
  )
}
