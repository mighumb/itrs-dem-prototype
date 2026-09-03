/**
 * Server-side guard: when the user stated a concrete journey outcome,
 * proposals[0] must honor it — never silently replace with homepage uptime
 * or “search from homepage” templates.
 */

import { shouldSkipJourneyChooser } from './discoverySiteIntent.js'

export type GuardProposal = {
  id: string
  title: string
  description: string
  prompt: string
}

function blobOf(p: GuardProposal): string {
  return `${p.title} ${p.description} ${p.prompt}`.toLowerCase()
}

/** Weak uptime / homepage-only cards banned by the system prompt. */
export function isWeakHomepageProposal(p: GuardProposal): boolean {
  const blob = blobOf(p)
  return /page\s+d['’]?accueil|homepage|disponib|availability|page\s+(répond|responds|se\s+charge)|site\s+est\s+accessible|chargement\s+correct|uptime|page\s+loads?/i.test(
    blob,
  )
}

/** Distinctive outcome verbs / nouns from the user's stated intent. */
function outcomeSignals(intent: string): RegExp[] {
  // Strip negated download/submit so “sans télécharger” does not keep a download signal.
  const t = intent
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\b(?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\/[^\s]*)?/gi, ' ')
    .replace(
      /(?:ne\s+(?:veux|veut|voulais|souhaite|voudrais)\s+pas|pas\s+(?:envie|besoin)\s+de|sans|without|don't|do\s+not)\s+(?:[^\n.!?]{0,40}?)?(?:télécharg\w*|download\w*|soumett\w*|submit\w*|envoy\w*)/gi,
      ' ',
    )
    .toLowerCase()

  const signals: RegExp[] = []
  if (
    /remplir|fill|tester|test|champ|field|saisie|formulaire|form\b/i.test(t) &&
    !/t[eé]l[eé]charg|download/i.test(t)
  ) {
    signals.push(/remplir|fill|tester|test|champ|field|saisie|formulaire|form\b|type|saisir/i)
  }
  if (/t[eé]l[eé]charg|download/i.test(t)) {
    signals.push(/t[eé]l[eé]charg|download|livre\s*blanc|white\s*paper|brochure|pdf|position\s*paper/i)
  }
  if (/brochure/i.test(t) && /t[eé]l[eé]charg|download|formulaire|remplir|fill/i.test(t)) {
    signals.push(/brochure|t[eé]l[eé]charg|download|formulaire|remplir|fill/i)
  }
  if (/livre\s*blanc|white\s*paper|position\s*paper/i.test(t)) {
    signals.push(/livre\s*blanc|white\s*paper|position\s*paper|t[eé]l[eé]charg|download/i)
  }
  if (/formulaire|devis|contact|essai|trial|demo|d[eé]mo/i.test(t)) {
    signals.push(/formulaire|devis|contact|essai|trial|demo|d[eé]mo|remplir|fill|soumettre|submit|champ|field/i)
  }
  if (/achat|acheter|panier|checkout|commande|buy|cart|order/i.test(t)) {
    signals.push(/achat|acheter|panier|checkout|commande|buy|cart|order/i)
  }
  if (/recherch|search/i.test(t)) signals.push(/recherch|search/i)
  if (/r[eé]serv|book(?:ing)?/i.test(t)) signals.push(/r[eé]serv|book/i)
  if (/connexion|login|sign[\s-]?in/i.test(t)) signals.push(/connexion|login|sign[\s-]?in|compte|account/i)
  return signals
}

/** True when a proposal plausibly implements the stated outcome. */
export function proposalHonorsStatedIntent(
  p: GuardProposal,
  statedJourneyIntent: string,
): boolean {
  if (isWeakHomepageProposal(p)) return false
  const blob = blobOf(p)
  const signals = outcomeSignals(statedJourneyIntent)
  if (signals.length === 0) {
    // Fallback: share a distinctive quoted / capitalized phrase (≥4 chars).
    const quoted =
      statedJourneyIntent.match(/[«"']([^«"']{4,80})[»"']/)?.[1] ??
      statedJourneyIntent.match(/\b([A-ZÀ-Ü][\wÀ-ü&'.-]{3,}(?:\s+[A-ZÀ-Ü][\wÀ-ü&'.-]{2,}){0,4})\b/)?.[1]
    if (quoted && blob.includes(quoted.toLowerCase().slice(0, 24))) return true
    return !/depuis\s+la\s+page\s+d['’]?accueil|from\s+the\s+homepage|chercher\s+le\s+livre/i.test(
      blob,
    )
  }
  return signals.some((re) => re.test(blob))
}

function clipLabel(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${(at > Math.min(16, max - 8) ? cut.slice(0, at) : cut).trim()}…`
}

function shortTitleFromIntent(intent: string, fr: boolean): string {
  const cleaned = intent
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/t[eé]l[eé]charg|download/i.test(cleaned) && /livre\s*blanc|white\s*paper|position\s*paper/i.test(cleaned)) {
    const name =
      cleaned.match(/\bekara(?:\s+pod)?\b/i)?.[0]?.trim() ??
      cleaned.match(/[«"']([^«"']{4,60})[»"']/)?.[1]?.trim() ??
      null
    if (name) {
      return fr
        ? `Télécharger « ${clipLabel(name, 36)} »`
        : `Download “${clipLabel(name, 36)}”`
    }
    return fr ? 'Télécharger le livre blanc' : 'Download the white paper'
  }
  if (/brochure/i.test(cleaned)) {
    return fr ? 'Télécharger la brochure' : 'Download the brochure'
  }
  return clipLabel(cleaned, 56) || (fr ? 'Parcours demandé' : 'Requested journey')
}

function repairProposalFromIntent(
  intent: string,
  destination: string | null,
  fr: boolean,
): GuardProposal {
  const title = shortTitleFromIntent(intent, fr)
  const where = destination
    ? fr
      ? ` sur ${destination}`
      : ` at ${destination}`
    : ''
  return {
    id: 'intent-honored-1',
    title,
    description: fr
      ? `Réaliser la demande utilisateur${where} — pas un contrôle d’accueil générique.`
      : `Carry out the user’s stated goal${where} — not a generic homepage check.`,
    prompt: intent.length > 400 ? `${intent.slice(0, 397)}…` : intent,
  }
}

/** When evidence is thin/blocked, still offer concrete paths for the stated outcome. */
export function synthesizeProposalsFromIntent(
  intent: string,
  destination: string | null,
  fr: boolean,
): GuardProposal[] {
  const cleaned = intent.replace(/https?:\/\/[^\s<>"']+/gi, ' ').replace(/\s+/g, ' ').trim()

  // Fill / test fields without download or submit — never invent a download path.
  const fillWithoutSubmit =
    /sans\s+(?:télécharg|download|soumett|submit)|without\s+(?:download|submit)|champs?.{0,40}(?:sans|without)|fields?.{0,40}(?:sans|without)|remplir\s*\/\s*tester|fill\s*\/\s*test/i.test(
      cleaned,
    ) ||
    (/remplir|fill|tester|test|champ|field|saisie/i.test(cleaned) &&
      /sans\s+(?:télécharg|download|soumett|submit)|without\s+(?:download|submit)/i.test(cleaned))

  if (fillWithoutSubmit) {
    return [
      {
        id: 'intent-fill-fields-only',
        title: fr ? 'Remplir les champs (sans envoi)' : 'Fill the fields (no submit)',
        description: fr
          ? `Ouvrir le formulaire${destination ? ` sur ${destination}` : ''}, saisir les champs requis, et s’arrêter avant téléchargement / envoi.`
          : `Open the form${destination ? ` at ${destination}` : ''}, fill the required fields, and stop before download / submit.`,
        prompt: intent.length > 400 ? `${intent.slice(0, 397)}…` : intent,
      },
    ]
  }

  const isWhitePaperDownload =
    /t[eé]l[eé]charg|download/i.test(cleaned) &&
    /livre\s*blanc|white\s*paper|position\s*paper|brochure/i.test(cleaned) &&
    !/sans\s+(?:télécharg|download)|without\s+download/i.test(cleaned)

  if (isWhitePaperDownload) {
    const doc =
      cleaned.match(/\bekara(?:\s+pod)?\b/i)?.[0]?.trim() ??
      cleaned.match(/[«"']([^«"']{4,50})[»"']/)?.[1]?.trim() ??
      (fr ? 'le livre blanc' : 'the white paper')
    return [
      {
        id: 'intent-download-resources',
        title: fr ? 'Télécharger via Ressources' : 'Download via Resources',
        description: fr
          ? `Depuis l’accueil, ouvrir Ressources / Livres blancs, trouver « ${clipLabel(doc, 28)} » et télécharger.`
          : `From the homepage, open Resources / White papers, find “${clipLabel(doc, 28)}” and download.`,
        prompt: intent.length > 400 ? `${intent.slice(0, 397)}…` : intent,
      },
      {
        id: 'intent-download-search',
        title: fr ? 'Télécharger via la recherche' : 'Download via site search',
        description: fr
          ? `Depuis l’accueil, rechercher « ${clipLabel(doc, 28)} », ouvrir le résultat et lancer le téléchargement.`
          : `From the homepage, search “${clipLabel(doc, 28)}”, open the result, and download.`,
        prompt: intent.length > 400 ? `${intent.slice(0, 397)}…` : intent,
      },
    ]
  }

  const primary = repairProposalFromIntent(intent, destination, fr)
  if (!destination) return [primary]
  return [
    primary,
    {
      id: 'intent-alt-page',
      title: fr ? 'Contrôler la page destination' : 'Check the destination page',
      description: fr
        ? `Vérifier que la page fournie charge et affiche le contenu attendu.`
        : `Verify the provided page loads and shows the expected content.`,
      prompt: fr
        ? `Ouvrir ${destination} et vérifier le contenu clé (sans contrôler seulement l’accueil).`
        : `Open ${destination} and verify key content (not homepage-only).`,
    },
  ]
}

/**
 * Ensure proposals[0] matches statedJourneyIntent when present.
 * Synthesizes proposals when the model returns none / only weak homepage cards.
 */
export function ensureProposalsHonorStatedIntent(
  proposals: unknown,
  statedJourneyIntent: string | null | undefined,
  options?: { destinationUrl?: string | null; preferredLanguage?: string | null },
): GuardProposal[] | null {
  const intent = typeof statedJourneyIntent === 'string' ? statedJourneyIntent.trim() : ''
  const fr = (options?.preferredLanguage ?? 'en') === 'fr'
  const destination = options?.destinationUrl ?? null

  const normalized = Array.isArray(proposals)
    ? proposals.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return []
        const p = raw as Record<string, unknown>
        if (typeof p.title !== 'string' || !p.title.trim()) return []
        if (typeof p.description !== 'string' || !p.description.trim()) return []
        if (typeof p.prompt !== 'string' || !p.prompt.trim()) return []
        return [
          {
            id:
              typeof p.id === 'string' && p.id.trim()
                ? p.id
                : `proposal-${Math.random().toString(36).slice(2, 7)}`,
            title: p.title.trim().slice(0, 120),
            description: p.description.trim().slice(0, 220),
            prompt: p.prompt.trim().slice(0, 500),
          } satisfies GuardProposal,
        ]
      })
    : []

  if (!intent) {
    if (normalized.length === 0) return null
    const withoutWeak = normalized.filter((p) => !isWeakHomepageProposal(p))
    return (withoutWeak.length >= 2 ? withoutWeak : normalized).slice(0, 3)
  }

  if (normalized.length === 0) {
    const synthesized = synthesizeProposalsFromIntent(intent, destination, fr)
    if (shouldSkipJourneyChooser(intent)) {
      return [synthesized[0]!]
    }
    return synthesized
  }

  const withoutWeak = normalized.filter((p) => !isWeakHomepageProposal(p))
  // When the user wants fill-only, drop leftover download cards before honor checks.
  const fillOnly =
    /sans\s+(?:télécharg|download|soumett|submit)|without\s+(?:download|submit)/i.test(intent) &&
    /remplir|fill|tester|test|champ|field|saisie|formulaire/i.test(intent)
  const scoped = fillOnly
    ? withoutWeak.filter(
        (p) =>
          !/t[eé]l[eé]charg|download|livre\s*blanc|white\s*paper|soumett|submit|envoy(er)?|send\s+(the\s+)?form/i.test(
            blobOf(p),
          ),
      )
    : withoutWeak
  // Fill-only: never fall back to contradicted download/submit cards — synthesize instead.
  const pool = fillOnly
    ? scoped.length > 0
      ? scoped
      : []
    : (scoped.length > 0 ? scoped : withoutWeak).length > 0
      ? scoped.length > 0
        ? scoped
        : withoutWeak
      : normalized

  if (fillOnly && pool.length === 0) {
    const synthesized = synthesizeProposalsFromIntent(intent, destination, fr)
    return [synthesized[0]!]
  }

  const honored = pool.filter((p) => proposalHonorsStatedIntent(p, intent))
  if (honored.length > 0) {
    const rest = pool.filter((p) => p !== honored[0] && !isWeakHomepageProposal(p))
    const merged = [honored[0]!, ...rest].slice(0, 3)
    if (shouldSkipJourneyChooser(intent) || fillOnly) {
      return [merged[0]!]
    }
    return merged
  }

  // Model missed the outcome — replace with synthesized paths for the stated ask.
  const synthesized = synthesizeProposalsFromIntent(intent, destination, fr)
  if (shouldSkipJourneyChooser(intent) || fillOnly) {
    return [synthesized[0]!]
  }
  return synthesized
}
