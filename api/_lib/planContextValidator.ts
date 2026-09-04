/**
 * Validate LLM plans against JourneyContext — rewrite or flag incoherent steps.
 */

import type { JourneyContext } from './journeyContext.js'
import {
  stripCookieConsentSteps,
  stripHomepageSearchDetour,
  stripPostDownloadSectionSteps,
} from './downloadPlanGrounding.js'
import type { GroundableStep } from './formFieldGrounding.js'
import { synthesizePlanFromContext } from './planSynthesis.js'

export type PlanStep = {
  label: string
  action: string
  targetHint?: string
  href?: string
}

function isTypeStep(step: PlanStep): boolean {
  return /^(type|fill|search)/i.test(step.action) || /^(type|sais|remplir|fill)/i.test(step.label.trim())
}

function isDownloadClick(step: PlanStep): boolean {
  const blob = `${step.action} ${step.label} ${step.targetHint ?? ''}`
  return /click|cliquer/i.test(blob) && /download|t[eé]l[eé]charg|brief|brochure/i.test(blob)
}

function isSectionVerify(step: PlanStep): boolean {
  return /verify|vérif/i.test(`${step.action} ${step.label}`) && /section|use[- ]?cases/i.test(step.label)
}

function isDemoClick(step: PlanStep): boolean {
  const blob = `${step.label} ${step.targetHint ?? ''}`
  return /book\s+a\s+demo|request\s+a\s+demo|demo\b/i.test(blob)
}

function planHasDownloadClick(steps: PlanStep[], ctaLabel?: string): boolean {
  if (!ctaLabel) return steps.some(isDownloadClick)
  const norm = ctaLabel.toLowerCase()
  return steps.some((s) => {
    if (!isDownloadClick(s)) return false
    const hint = `${s.targetHint ?? ''} ${s.label}`.toLowerCase()
    return hint.includes(norm) || norm.includes(hint.replace(/[^a-z0-9\s]/g, ' '))
  })
}

export type PlanValidationResult = {
  steps: PlanStep[]
  issues: string[]
  rewritten: boolean
}

/**
 * Enforce context-aware plan shape. Full rewrite when high-confidence synthesis exists.
 */
export function validatePlanAgainstContext(
  steps: PlanStep[],
  ctx: JourneyContext | null,
  explore: Parameters<typeof synthesizePlanFromContext>[1],
): PlanValidationResult {
  if (!ctx) return { steps, issues: [], rewritten: false }

  const synthesized = synthesizePlanFromContext(ctx, explore)
  if (synthesized) {
    return {
      steps: synthesized,
      issues: ['Plan synthesized from journey context (outcome + page archetype)'],
      rewritten: true,
    }
  }

  let next = [...steps]
  const issues: string[] = []

  if (ctx.skipHomepageDetour && ctx.destinationUrl) {
    const before = next.length
    next = stripHomepageSearchDetour(stripCookieConsentSteps(next), ctx.destinationUrl)
    if (next.length < before) issues.push('Removed homepage/search/cookie detour steps')
  }

  if (ctx.outcome === 'download' && ctx.destinationUrl && ctx.highConfidence) {
    next = stripPostDownloadSectionSteps(next)

    if (!ctx.hasFormEvidence) {
      const withoutTypes = next.filter((s) => !isTypeStep(s))
      if (withoutTypes.length < next.length) {
        issues.push('Removed Type steps — no observed form on destination page')
        next = withoutTypes
      }
    }

    next = next.filter((s) => !isDemoClick(s))
    if (next.length < steps.length) issues.push('Removed demo CTA steps conflicting with download outcome')

    if (ctx.primaryCta && !planHasDownloadClick(next, ctx.primaryCta.label)) {
      issues.push(`Plan missing Click on observed download CTA « ${ctx.primaryCta.label} »`)
    }

    const last = next[next.length - 1]
    if (last && isSectionVerify(last)) {
      issues.push('Final Verify targets section instead of download outcome')
    }
  }

  return {
    steps: next.slice(0, 8),
    issues,
    rewritten: issues.length > 0 && next !== steps,
  }
}
