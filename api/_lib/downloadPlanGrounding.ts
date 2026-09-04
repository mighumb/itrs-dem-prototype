/**
 * Structural download plan grounding — rewrite incoherent LLM plans when the user
 * gave a deep URL + download outcome and explore observed the CTA.
 * Generic across sites (ITRS solution brief, HETIC brochure, white papers…).
 */

import type { SiteExploreResult } from './exploreSite.js'
import {
  hasExplicitSiteLocator,
  isFillFieldsWithoutSubmitAsk,
  shouldSkipJourneyChooser,
} from './discoverySiteIntent.js'
import {
  fieldNameFromTypeLabel,
  observedFormInventory,
  type GroundableStep,
} from './formFieldGrounding.js'
import {
  findObservedDownloadCta,
  isDownloadOutcomeIntent,
  type ObservedDownloadCta,
} from './downloadCtaGrounding.js'
import { isDeepUrl } from './urlPathHelpers.js'

export type DownloadPlanStep = {
  label: string
  action: string
  targetHint?: string
  href?: string
}

const COOKIE_STEP_RE =
  /cookie|consent|didomi|onetrust|rgpd|gdpr|tout\s+accepter|accept\s+all|accepter\s+tout|j['’]accepte\s+les/i

const HOMEPAGE_ENTRY_RE =
  /page\s+d['’]?accueil|homepage|home\s+page/i

const SEARCH_TYPE_RE =
  /^(type|search|recherch|taper|tape|sais)/i

function resolveDestinationUrl(
  stated: string,
  contextUrl?: string | null,
): string | null {
  const fromText = stated.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '')
  if (fromText) return fromText
  if (contextUrl?.trim()) return contextUrl.trim()
  return null
}

function preferFr(steps: DownloadPlanStep[], stated: string): boolean {
  return /[àâäéèêëïîôùûüç]/i.test(`${stated} ${steps.map((s) => s.label).join(' ')}`)
}

function clipUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = `${u.pathname}${u.search}${u.hash}`
    if (path.length > 48) return `${u.origin}${path.slice(0, 45)}…`
    return `${u.origin}${path}`
  } catch {
    return url.length > 56 ? `${url.slice(0, 53)}…` : url
  }
}

export function isCookieConsentStep(step: GroundableStep): boolean {
  return COOKIE_STEP_RE.test(`${step.action} ${step.label} ${step.targetHint ?? ''}`)
}

function isNavigateStep(step: GroundableStep): boolean {
  return /navigate|go to|open/i.test(step.action) || /navigate|ouvre https?/i.test(step.label)
}

function isTypeLikeStep(step: GroundableStep): boolean {
  const act = step.action.trim().toLowerCase()
  if (act === 'type' || act === 'fill' || act === 'search') return true
  return /^(type|sais|taper|remplir|fill|search|recherch)/i.test(step.label.trim())
}

function isVerifyStep(step: GroundableStep): boolean {
  return /verify|vérif|wait|check/i.test(`${step.action} ${step.label}`)
}

function isDownloadRelatedClick(step: GroundableStep): boolean {
  const blob = `${step.action} ${step.label} ${step.targetHint ?? ''}`
  return (
    /click|cliquer|clique/i.test(blob) &&
    /t[eé]l[eé]charg|download|brochure|brief|white\s*paper|livre\s*blanc|pdf|solution/i.test(
      blob,
    )
  )
}

function isSectionNavigationStep(step: GroundableStep): boolean {
  const blob = `${step.label} ${step.targetHint ?? ''} ${step.href ?? ''}`
  if (/section|use[- ]?cases|statistiques|statistics|anchor|#/.test(blob)) return true
  if (/ouvrir\s+la\s+section|open\s+the\s+"/i.test(step.label)) return true
  return false
}

function isHomepageSearchDetourStep(step: GroundableStep): boolean {
  if (isCookieConsentStep(step)) return true
  if (isNavigateStep(step) && HOMEPAGE_ENTRY_RE.test(step.label)) return true
  if (isTypeLikeStep(step) && /recherch|search/i.test(step.label)) return true
  if (
    /click|cliquer/i.test(step.action) &&
    (/ouvrir\s+«|open\s+"/i.test(step.label)) &&
    !isDownloadRelatedClick(step)
  ) {
    return true
  }
  return false
}

/** True when download plan grounding should run (bypass naturalizeDeepLinkEntry). */
export function shouldApplyDownloadPlanGrounding(
  stated: string | null | undefined,
  contextUrl: string | null | undefined,
  explore: SiteExploreResult | null | undefined,
): boolean {
  const text = `${stated ?? ''}`.trim()
  if (!text || !isDownloadOutcomeIntent(text)) return false
  if (isFillFieldsWithoutSubmitAsk(text)) return false

  const destination = resolveDestinationUrl(text, contextUrl)
  if (!destination || !isDeepUrl(destination)) return false
  if (!hasExplicitSiteLocator(text) && !(contextUrl && isDeepUrl(contextUrl))) return false

  const cta = findObservedDownloadCta(explore, text, destination)
  if (cta) return true

  return shouldSkipJourneyChooser(text)
}

export function stripCookieConsentSteps<T extends GroundableStep>(steps: T[]): T[] {
  return steps.filter((s) => !isCookieConsentStep(s))
}

/** Remove homepage → search → open detour when user already gave the destination URL. */
export function stripHomepageSearchDetour<T extends GroundableStep>(
  steps: T[],
  destination: string,
): T[] {
  return steps.filter((s) => !isHomepageSearchDetourStep(s))
}

/** Drop section/hash navigation and weak section Verify after the download click. */
export function stripPostDownloadSectionSteps<T extends GroundableStep>(steps: T[]): T[] {
  let downloadIdx = -1
  for (let i = steps.length - 1; i >= 0; i--) {
    if (isDownloadRelatedClick(steps[i]!)) {
      downloadIdx = i
      break
    }
  }
  if (downloadIdx < 0) {
    return steps.filter((s) => !isSectionNavigationStep(s) || !isVerifyStep(s))
  }

  const kept: T[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!
    if (i <= downloadIdx) {
      kept.push(step)
      continue
    }
    if (isSectionNavigationStep(step)) continue
    if (isVerifyStep(step) && isSectionNavigationStep(step)) continue
    if (isVerifyStep(step) && /section|use[- ]?cases/i.test(step.label)) continue
    kept.push(step)
  }
  return kept
}

function ensureDirectNavigate(
  steps: DownloadPlanStep[],
  destination: string,
  langFr: boolean,
): DownloadPlanStep[] {
  if (steps.length === 0) {
    return [
      {
        action: 'Navigate',
        label: langFr ? `Ouvrir ${clipUrl(destination)}` : `Open ${clipUrl(destination)}`,
        href: destination,
      },
    ]
  }

  const navIdx = steps.findIndex(isNavigateStep)
  const navigate: DownloadPlanStep = {
    action: 'Navigate',
    label: langFr ? `Ouvrir ${clipUrl(destination)}` : `Open ${clipUrl(destination)}`,
    href: destination,
  }

  if (navIdx < 0) return [navigate, ...steps]
  const next = [...steps]
  next[navIdx] = navigate
  return next
}

function collectFormTypeSteps(
  explore: SiteExploreResult | null | undefined,
  existingSteps: DownloadPlanStep[],
  langFr: boolean,
): DownloadPlanStep[] {
  const inventory = observedFormInventory(explore)
  if (inventory?.hasFormEvidence) {
    const types: DownloadPlanStep[] = []
    for (const field of inventory.fields) {
      if (field.kind === 'checkbox') continue
      types.push({
        action: 'Type',
        label: langFr
          ? `Saisir une valeur de test dans le champ ${field.raw}`
          : `Type a test value into the ${field.raw} field`,
        targetHint: field.raw,
      })
    }
    return types.slice(0, 5)
  }

  return existingSteps
    .filter(isTypeLikeStep)
    .filter((s) => !/recherch|search/i.test(s.label))
    .slice(0, 5)
}

function normalizeCtaLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bthe\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function ctaLabelsMatch(a: string, b: string): boolean {
  const na = normalizeCtaLabel(a)
  const nb = normalizeCtaLabel(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function findDistinctSubmitClick(
  existingSteps: DownloadPlanStep[],
  cta: ObservedDownloadCta,
): DownloadPlanStep | null {
  for (let i = existingSteps.length - 1; i >= 0; i--) {
    const step = existingSteps[i]!
    if (!/click|cliquer|clique|submit|soumet/i.test(`${step.action} ${step.label}`)) continue
    const hint = `${step.targetHint ?? ''} ${step.label}`
    if (ctaLabelsMatch(hint, cta.label)) continue
    if (/envoyer|submit|valider|send|je\s+valide|t[eé]l[eé]charg|download/i.test(hint)) {
      return step
    }
  }
  return null
}

/** Build a minimal coherent download plan from observed CTA + form inventory. */
export function synthesizeObservedDownloadPlan(
  destination: string,
  cta: ObservedDownloadCta,
  explore: SiteExploreResult | null | undefined,
  existingSteps: DownloadPlanStep[],
  langFr: boolean,
): DownloadPlanStep[] {
  const steps: DownloadPlanStep[] = [
    {
      action: 'Navigate',
      label: langFr ? `Ouvrir ${clipUrl(destination)}` : `Open ${clipUrl(destination)}`,
      href: destination,
    },
  ]

  const inventory = observedFormInventory(explore)
  const typesBeforeClick = inventory?.hasFormEvidence
  const typeSteps = collectFormTypeSteps(explore, existingSteps, langFr)

  if (typesBeforeClick && typeSteps.length > 0) {
    steps.push(...typeSteps)
  }

  steps.push({
    action: 'Click',
    label: langFr ? `Cliquer sur « ${cta.label} »` : `Click “${cta.label}”`,
    targetHint: cta.label,
    ...(cta.href ? { href: cta.href } : {}),
  })

  if (!typesBeforeClick && typeSteps.length > 0) {
    steps.push(...typeSteps)
  }

  const submit = findDistinctSubmitClick(existingSteps, cta)
  if (submit) steps.push(submit)

  steps.push({
    action: 'Verify',
    label: langFr
      ? 'Vérifier la confirmation / le succès du téléchargement'
      : 'Verify the download confirmation / success',
    targetHint: 'confirmation',
  })

  return steps.slice(0, 8)
}

function cleanupDownloadPlanWithoutObservedCta(
  steps: DownloadPlanStep[],
  destination: string,
  langFr: boolean,
): DownloadPlanStep[] {
  let result = stripCookieConsentSteps(steps)
  result = stripHomepageSearchDetour(result, destination)
  result = ensureDirectNavigate(result, destination, langFr)
  result = stripPostDownloadSectionSteps(result)
  return result.slice(0, 8)
}

/**
 * Rewrite or clean plan steps for explicit deep-link download journeys.
 * When explore observed the CTA, replace the whole plan; otherwise strip detours.
 */
export function applyDownloadPlanGrounding(
  steps: DownloadPlanStep[],
  explore: SiteExploreResult | null | undefined,
  contextUrl: string | null | undefined,
  userMessage: string | null | undefined,
): DownloadPlanStep[] {
  const stated = `${userMessage ?? ''}`.trim()
  if (!shouldApplyDownloadPlanGrounding(stated, contextUrl, explore)) return steps

  const destination = resolveDestinationUrl(stated, contextUrl)!
  const langFr = preferFr(steps, stated)
  const cleaned = stripCookieConsentSteps(steps)

  const cta = findObservedDownloadCta(explore, stated, destination)
  if (cta) {
    return synthesizeObservedDownloadPlan(destination, cta, explore, cleaned, langFr)
  }

  return cleanupDownloadPlanWithoutObservedCta(cleaned, destination, langFr)
}

/** Exported for tests — detect invented type fields in rewritten plans. */
export function typeStepFieldName(step: GroundableStep): string | null {
  return fieldNameFromTypeLabel(step.label)
}
