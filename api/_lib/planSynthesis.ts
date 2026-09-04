/**
 * Server-owned plan synthesis from JourneyContext — high-confidence paths only.
 */

import type { SiteExploreResult } from './exploreSite.js'
import { observedFormInventory } from './formFieldGrounding.js'
import type { JourneyContext } from './journeyContext.js'
import type { ObservedDownloadCta } from './downloadCtaGrounding.js'

export type SynthesizedPlanStep = {
  label: string
  action: string
  targetHint?: string
  href?: string
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

function toDownloadCta(cta: NonNullable<JourneyContext['primaryCta']>): ObservedDownloadCta {
  return {
    label: cta.label,
    href: cta.href,
    pageUrl: cta.pageUrl,
    source: cta.source,
  }
}

function formTypeSteps(
  explore: SiteExploreResult | null | undefined,
  langFr: boolean,
  destinationUrl?: string | null,
): SynthesizedPlanStep[] {
  const inventory = observedFormInventory(explore, { pageUrl: destinationUrl })
  if (!inventory?.hasFormEvidence) return []
  const types: SynthesizedPlanStep[] = []
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

/** Build a plan when context confidence is high enough to skip LLM steps. */
export function synthesizePlanFromContext(
  ctx: JourneyContext,
  explore: SiteExploreResult | null | undefined,
): SynthesizedPlanStep[] | null {
  if (!ctx.highConfidence || !ctx.destinationUrl) return null

  const dest = ctx.destinationUrl
  const fr = ctx.langFr

  if (ctx.outcome === 'download' && ctx.primaryCta) {
    const cta = toDownloadCta(ctx.primaryCta)
    const steps: SynthesizedPlanStep[] = [
      {
        action: 'Navigate',
        label: fr ? `Ouvrir ${clipUrl(dest)}` : `Open ${clipUrl(dest)}`,
        href: dest,
      },
    ]
    const types = formTypeSteps(explore, fr, dest)
    if (ctx.pageArchetype === 'gated_download' && types.length > 0) {
      steps.push(...types)
    }
    steps.push({
      action: 'Click',
      label: fr ? `Cliquer sur « ${cta.label} »` : `Click “${cta.label}”`,
      targetHint: cta.label,
      ...(cta.href ? { href: cta.href } : {}),
    })
    steps.push({
      action: 'Verify',
      // Soft success signal: CTA still present or download started — never the
      // literal word "confirmation" (absent on most marketing pages).
      label: fr
        ? 'Vérifier le succès du téléchargement'
        : 'Verify the download succeeded',
      targetHint: cta.label,
    })
    return steps.slice(0, 8)
  }

  if (ctx.outcome === 'fill_fields' && ctx.pageArchetype === 'lead_form') {
    const types = formTypeSteps(explore, fr, dest)
    if (types.length === 0) return null
    return [
      {
        action: 'Navigate',
        label: fr ? `Ouvrir ${clipUrl(dest)}` : `Open ${clipUrl(dest)}`,
        href: dest,
      },
      ...types,
      {
        action: 'Verify',
        label: fr
          ? 'Vérifier que les champs du formulaire acceptent la saisie'
          : 'Verify the form fields accept input',
        targetHint: 'fields',
      },
    ].slice(0, 8)
  }

  return null
}
