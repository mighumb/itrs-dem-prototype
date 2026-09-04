/**
 * Structural form grounding — plan steps must match observed siteExplore form fields.
 * Generic across sites; not tied to one brand or phrasing.
 */

import type { SiteExploreResult } from './exploreSite.js'

export type ObservedFormField = {
  raw: string
  norm: string
  kind: 'checkbox' | 'email' | 'tel' | 'password' | 'text' | 'select' | 'textarea' | 'other'
}

export type ObservedFormInventory = {
  fields: ObservedFormField[]
  hasCheckbox: boolean
  /** True when explore captured at least one non-trivial form (≥2 fields). */
  hasFormEvidence: boolean
}

export type GroundableStep = {
  label: string
  action: string
  targetHint?: string
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CHECKBOX_FIELD_RE =
  /^(checkbox|check|consent|rgpd|gdpr|cgu|cgv|privacy|optin|opt_in|accept|newsletter|marketing)$/i

const CONSENT_STEP_RE =
  /cocher|checkbox|case\s+a\s+cocher|consentement|consent|rgpd|gdpr|cgu|cgv|politique|opt[- ]?in|j['’]accepte|i\s+agree|accepte\s+les\s+conditions/i

const FIELD_ALIASES: Record<string, string[]> = {
  email: ['mail', 'e mail', 'courriel'],
  tel: ['phone', 'telephone', 'mobile', 'gsm'],
  nom: ['name', 'lastname', 'last name', 'surname', 'family'],
  prenom: ['firstname', 'first name', 'given'],
  password: ['pwd', 'pass', 'mot de passe', 'motdepasse'],
}

function classifyFieldKind(raw: string): ObservedFormField['kind'] {
  const n = normalizeText(raw)
  if (!n) return 'other'
  if (n === 'checkbox' || CHECKBOX_FIELD_RE.test(n)) return 'checkbox'
  if (/email|mail|courriel/.test(n)) return 'email'
  if (/tel|phone|mobile|gsm/.test(n)) return 'tel'
  if (/pass|pwd|mot de passe|motdepasse/.test(n)) return 'password'
  if (/select|dropdown|liste/.test(n)) return 'select'
  if (/textarea|message|comment/.test(n)) return 'textarea'
  return 'text'
}

/** Build a merged form inventory from all pages in a Playwright explore result. */
export function observedFormInventory(
  explore: SiteExploreResult | null | undefined,
): ObservedFormInventory | null {
  if (!explore?.ok || !explore.pages?.length) return null

  const seen = new Set<string>()
  const fields: ObservedFormField[] = []

  for (const page of explore.pages) {
    for (const form of page.forms ?? []) {
      for (const raw of form.fields ?? []) {
        const trimmed = `${raw ?? ''}`.trim()
        if (!trimmed) continue
        const norm = normalizeText(trimmed)
        if (!norm || seen.has(norm)) continue
        seen.add(norm)
        fields.push({ raw: trimmed, norm, kind: classifyFieldKind(trimmed) })
      }
    }
  }

  if (fields.length === 0) return null

  return {
    fields,
    hasCheckbox: fields.some((f) => f.kind === 'checkbox'),
    hasFormEvidence: fields.filter((f) => f.kind !== 'checkbox').length >= 2,
  }
}

export function fieldNameFromTypeLabel(label: string): string | null {
  const m =
    label.match(
      /\b(?:dans|in|into|pour|dans\s+le\s+champ|in\s+(?:the\s+)?field)\s+(?:le\s+|la\s+|l['’]\s*)?(?:champ\s+)?[«"'“”]?([^»"'“”\n]+?)[»"'“”]?\s*$/i,
    ) ??
    label.match(/\b(?:field|champ)\s+[«"'“”]?([^»"'“”\n]+?)[»"'“”]?\s*$/i)
  const name = m?.[1]?.trim()
  return name && name.length >= 2 && name.length <= 48 ? name : null
}

function aliasNorms(norm: string): string[] {
  const out = [norm]
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (norm === canonical || aliases.includes(norm)) {
      out.push(canonical, ...aliases)
    }
  }
  return [...new Set(out)]
}

/** Fuzzy match a plan field name against observed inventory tokens. */
export function fieldMatchesObserved(fieldName: string, inventory: ObservedFormInventory): boolean {
  const n = normalizeText(fieldName)
  if (!n) return false
  const needles = aliasNorms(n)
  return inventory.fields.some((f) => {
    const hay = aliasNorms(f.norm)
    return needles.some(
      (needle) =>
        hay.some((h) => h === needle || h.includes(needle) || needle.includes(h)) ||
        f.norm === needle ||
        f.norm.includes(needle) ||
        needle.includes(f.norm),
    )
  })
}

export function stepReferencesConsentOrCheckbox(step: GroundableStep): boolean {
  const blob = `${step.action} ${step.label} ${step.targetHint ?? ''}`
  if (CONSENT_STEP_RE.test(blob)) return true
  if (/^check$/i.test(step.action.trim()) && /case|box|consent|rgpd/i.test(blob)) return true
  return false
}

function isTypeLikeStep(step: GroundableStep): boolean {
  const act = step.action.trim().toLowerCase()
  if (act === 'type' || act === 'fill' || act === 'search') return true
  return /^(type|sais|taper|remplir|fill|search|recherch)/i.test(step.label.trim())
}

function isSelectLikeStep(step: GroundableStep): boolean {
  return /select|choisir|sélection|selection/i.test(`${step.action} ${step.label}`)
}

/**
 * Drop plan steps that reference form controls absent from observed inventory.
 * When explore has no form evidence, returns steps unchanged (hypothesis mode).
 */
export function stripUnobservedFormSteps<T extends GroundableStep>(
  steps: T[],
  explore: SiteExploreResult | null | undefined,
): T[] {
  const inventory = observedFormInventory(explore)
  if (!inventory) return steps

  return steps.filter((step) => {
    // Checkbox / consent controls
    if (stepReferencesConsentOrCheckbox(step) && !inventory.hasCheckbox) {
      return false
    }

    if (!inventory.hasFormEvidence) return true

    if (isTypeLikeStep(step)) {
      const field = fieldNameFromTypeLabel(step.label)
      if (!field) return true
      if (stepReferencesConsentOrCheckbox(step) && !inventory.hasCheckbox) return false
      if (/consent|rgpd|gdpr|cgu|checkbox|opt[- ]?in/i.test(normalizeText(field))) {
        return inventory.hasCheckbox
      }
      return fieldMatchesObserved(field, inventory)
    }

    if (isSelectLikeStep(step)) {
      const field = fieldNameFromTypeLabel(step.label) ?? extractQuoted(step.label)
      if (!field) return true
      const hasSelect = inventory.fields.some((f) => f.kind === 'select')
      if (!hasSelect && !fieldMatchesObserved(field, inventory)) return false
      return fieldMatchesObserved(field, inventory) || hasSelect
    }

    return true
  })
}

function extractQuoted(label: string): string | null {
  return label.match(/"([^"]+)"/)?.[1] ?? label.match(/«\s*([^»]+)\s*»/)?.[1] ?? null
}

/** Warnings when the model invented form controls not seen in explore. */
export function unobservedFormIssues(
  priorSteps: GroundableStep[],
  nextSteps: GroundableStep[],
  explore: SiteExploreResult | null | undefined,
): string[] {
  const inventory = observedFormInventory(explore)
  if (!inventory) return []

  const removed = priorSteps.filter((s) => !nextSteps.includes(s))
  const issues: string[] = []
  for (const step of removed) {
    if (stepReferencesConsentOrCheckbox(step) && !inventory.hasCheckbox) {
      issues.push(`Removed unobserved consent/checkbox step: "${step.label}"`)
      continue
    }
    const field = fieldNameFromTypeLabel(step.label)
    if (field && isTypeLikeStep(step) && !fieldMatchesObserved(field, inventory)) {
      issues.push(`Removed Type into unobserved field "${field}" (not in siteExplore.forms)`)
    }
  }
  return issues.slice(0, 4)
}
