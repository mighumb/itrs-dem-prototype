/**
 * Final Verify must assert critical-path success, not a lazy “page loads”.
 * Shared by Discovery grounding (server) and journeyLaunch (client).
 */

export type OutcomeVerifyStep = {
  label: string
  action: string
  targetHint?: string
  href?: string
}

/** Weak final Verify that only re-checks page load — useless after form Type/Click. */
export function isWeakPageLoadVerify(label: string): boolean {
  const l = label.trim()
  if (!l) return true
  // Already names a real outcome → keep.
  if (
    /confirmation|confirmé|télécharg|download|merci|thank|succ[eè]s|success|panier|cart|r[eé]sultats?|results?|devis|quote|section|statistiques|email\s+field|champ|ajout/i.test(
      l,
    )
  ) {
    return false
  }
  return /page\s+se\s+charge|loads?\s+correctly|page\s+loads|page\s+(répond|responds)|chargement\s+(correct|ok)|homepage\s+responds|disponible|availability|page\s+s['’]?affiche|verify\s+the\s+page|v[eé]rifier\s+que\s+la\s+page|page\s+loaded|correctement/i.test(
    l,
  )
}

function preferFrLabels(steps: OutcomeVerifyStep[]): boolean {
  return /[àâäéèêëïîôùûüç]/i.test(steps.map((s) => s.label).join(' '))
}

/**
 * Infer the critical-path success check from the last decisive Click/submit.
 * Generic across sites — not HETIC-only.
 */
export function outcomeVerifyFromSteps(
  steps: OutcomeVerifyStep[],
  langFr: boolean,
): { label: string; targetHint: string } | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!
    if (/verify|vérif|wait|check/i.test(`${step.action} ${step.label}`)) continue
    const blob = `${step.label} ${step.targetHint ?? ''} ${step.href ?? ''}`

    if (/télécharge|download|brochure/i.test(blob)) {
      return {
        label: langFr
          ? 'Vérifier la confirmation / le succès du téléchargement de brochure'
          : 'Verify the brochure download confirmation / success',
        targetHint: 'confirmation',
      }
    }
    if (/envoyer|submit|valider|send\s+(the\s+)?form|je\s+valide/i.test(blob)) {
      return {
        label: langFr
          ? 'Vérifier le message de confirmation d’envoi'
          : 'Verify the form submission confirmation message',
        targetHint: 'confirmation',
      }
    }
    if (/panier|add to cart|ajouter au panier|bag/i.test(blob)) {
      return {
        label: langFr
          ? 'Vérifier que le panier reflète l’ajout'
          : 'Verify the cart reflects the added item',
        targetHint: langFr ? 'panier' : 'cart',
      }
    }
    if (/recherch|search|lancer\s+la\s+recherch/i.test(blob)) {
      return {
        label: langFr
          ? 'Vérifier que des résultats s’affichent'
          : 'Verify that search results are listed',
        targetHint: langFr ? 'résultats' : 'results',
      }
    }
    if (/devis|quote|pricing/i.test(blob)) {
      return {
        label: langFr
          ? 'Vérifier qu’une étape de devis / récap s’affiche'
          : 'Verify a quote step or summary is shown',
        targetHint: langFr ? 'devis' : 'quote',
      }
    }
  }
  return null
}

/**
 * Rewrite a lazy final Verify (“page loads”) into a critical-path outcome check.
 */
export function ensureOutcomeVerify<T extends OutcomeVerifyStep>(steps: T[]): T[] {
  if (steps.length === 0) return steps
  const langFr = preferFrLabels(steps)
  const outcome = outcomeVerifyFromSteps(steps, langFr)
  if (!outcome) return steps

  const next = [...steps]
  const lastIdx = next.length - 1
  const last = next[lastIdx]!
  const lastIsVerify = /verify|vérif|wait|check/i.test(`${last.action} ${last.label}`)

  if (lastIsVerify) {
    if (!isWeakPageLoadVerify(last.label)) return steps
    next[lastIdx] = {
      ...last,
      action: 'Verify',
      label: outcome.label,
      targetHint: last.targetHint || outcome.targetHint,
    }
    return next
  }

  // Missing final Verify after a decisive action — append/replace within 8-step cap.
  if (next.length >= 8) {
    next[lastIdx] = {
      ...last,
      action: 'Verify',
      label: outcome.label,
      targetHint: outcome.targetHint,
    } as T
    return next
  }
  next.push({
    action: 'Verify',
    label: outcome.label,
    targetHint: outcome.targetHint,
  } as T)
  return next
}
