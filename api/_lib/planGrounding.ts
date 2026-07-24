/**
 * Ground Discovery plan steps against observed siteExplore inventory.
 * Auto-fills targetHint/href when labels match real links/buttons.
 */

import type { SiteExploreResult } from './exploreSite.js'

export type GroundedPlanStep = {
  label: string
  action: string
  targetHint?: string
  href?: string
}

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

    // Navigate steps: prefer an observed URL mentioned in the label, else first page.
    if ((/navigate|go to|open/i.test(action) || /https?:\/\//i.test(step.label)) && !next.href) {
      const urlMatch = step.label.match(/https?:\/\/[^\s"'<>]+/i)?.[0]
      if (urlMatch) next.href = urlMatch.replace(/[.,);]+$/g, '')
      else if (explore.pages[0]?.url) next.href = explore.pages[0].url
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

export function applyGroundingToPlan(
  plan: Record<string, unknown>,
  explore: SiteExploreResult | null,
): { plan: Record<string, unknown>; issues: string[] } {
  if (!plan || typeof plan !== 'object') return { plan, issues: [] }
  const rawSteps = Array.isArray(plan.steps) ? plan.steps : []
  const steps: GroundedPlanStep[] = rawSteps
    .map((step) => {
      if (!step || typeof step !== 'object') return null
      const s = step as Record<string, unknown>
      if (typeof s.label !== 'string' || typeof s.action !== 'string') return null
      return {
        label: s.label,
        action: s.action,
        targetHint: typeof s.targetHint === 'string' ? s.targetHint : undefined,
        href: typeof s.href === 'string' ? s.href : undefined,
      }
    })
    .filter((s): s is GroundedPlanStep => Boolean(s))

  const enriched = enrichPlanStepsFromExplore(steps, explore)
  const issues = groundingIssues(enriched, explore)
  return {
    plan: { ...plan, steps: enriched },
    issues,
  }
}
