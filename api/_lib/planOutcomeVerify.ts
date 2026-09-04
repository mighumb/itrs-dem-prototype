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
  // Vague “an element of the customer area / interface” is not a real outcome.
  if (
    /pr[eé]sence\s+d['’]?un\s+[eé]l[eé]ment|un\s+[eé]l[eé]ment\s+de\s+l['’]?espace|customer\s+area|espace\s+client|l['’]?interface|an\s+element\s+of|tableau\s+de\s+bord\s+ou\s+un\s+menu|dashboard\s+or\s+a\s+main\s+menu/i.test(
      l,
    )
  ) {
    return true
  }
  // Already names a real outcome → keep.
  if (
    /confirmation|confirmé|télécharg|download|merci|thank|succ[eè]s|success|panier|cart|r[eé]sultats?|results?|devis|quote|section|statistiques|email\s+field|d[eé]connexion|logout|mon\s+compte|bienvenue|welcome|dashboard|tableau\s+de\s+bord|ajout/i.test(
      l,
    )
  ) {
    return false
  }
  // “champ” alone is not a journey outcome (often leftover form-field checks).
  if (/^v[eé]rifier\s+(le\s+|la\s+|l['’])?champ\b/i.test(l)) return true
  return /page\s+se\s+charge|loads?\s+correctly|page\s+loads|page\s+(répond|responds)|chargement\s+(correct|ok)|homepage\s+responds|disponible|availability|page\s+s['’]?affiche|verify\s+the\s+page|v[eé]rifier\s+que\s+la\s+page|page\s+loaded|correctement/i.test(
    l,
  )
}

function preferFrLabels(steps: OutcomeVerifyStep[]): boolean {
  return /[àâäéèêëïîôùûüç]/i.test(steps.map((s) => s.label).join(' '))
}

function extractQuotedFromLabel(label: string): string | null {
  const m = label.match(/[«"“]([^»"”]+)[»"”]/)
  const q = m?.[1]?.trim()
  return q && q.length >= 3 && q.length <= 80 ? q : null
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

    // Require an actual download/submit control — a Navigate to /brochure is not a download outcome.
    if (
      /(click|cliquer|clique|soumett|submit|envoy)/i.test(`${step.action} ${step.label}`) &&
      /t[eé]l[eé]charg|download|brochure|solution\s*brief|white\s*paper|livre\s*blanc|position\s*paper/i.test(
        blob,
      )
    ) {
      const ctaHint =
        step.targetHint?.trim() ||
        extractQuotedFromLabel(step.label) ||
        (langFr ? 'téléchargement' : 'download')
      return {
        label: langFr
          ? 'Vérifier le succès du téléchargement'
          : 'Verify the download succeeded',
        targetHint: ctaHint,
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
    if (
      /se\s+connecter|je\s+me\s+connecte|sign\s*in|log\s*in|connexion|connecter/i.test(blob) &&
      !/ouvrir|open\s+(the\s+)?(login|connexion)/i.test(blob)
    ) {
      return {
        label: langFr
          ? 'Vérifier l’accès à l’espace client (Déconnexion / Mon compte / tableau de bord)'
          : 'Verify access to the account area (Logout / My account / dashboard)',
        targetHint: langFr ? 'Déconnexion' : 'Logout',
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
      // Prefer the outcome hint — vague leftovers like “élément” must not stick.
      targetHint: outcome.targetHint,
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
