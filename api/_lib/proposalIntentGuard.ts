/**
 * Server-side guard: when the user stated a concrete journey outcome,
 * proposals[0] must honor it — never silently replace with homepage uptime
 * or “search from homepage” templates.
 */

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
  const t = intent
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\b(?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\/[^\s]*)?/gi, ' ')
    .toLowerCase()

  const signals: RegExp[] = []
  if (/t[eé]l[eé]charg|download/i.test(t)) {
    signals.push(/t[eé]l[eé]charg|download|livre\s*blanc|white\s*paper|brochure|pdf|position\s*paper/i)
  }
  if (/brochure/i.test(t)) signals.push(/brochure|t[eé]l[eé]charg|download|formulaire/i)
  if (/livre\s*blanc|white\s*paper|position\s*paper/i.test(t)) {
    signals.push(/livre\s*blanc|white\s*paper|position\s*paper|t[eé]l[eé]charg|download/i)
  }
  if (/formulaire|devis|contact|essai|trial|demo|d[eé]mo/i.test(t)) {
    signals.push(/formulaire|devis|contact|essai|trial|demo|d[eé]mo|remplir|fill|soumettre|submit/i)
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

/**
 * Ensure proposals[0] matches statedJourneyIntent when present.
 * Drops weak homepage cards; synthesizes #1 from the intent when needed.
 */
export function ensureProposalsHonorStatedIntent(
  proposals: unknown,
  statedJourneyIntent: string | null | undefined,
  options?: { destinationUrl?: string | null; preferredLanguage?: string | null },
): GuardProposal[] | null {
  if (!Array.isArray(proposals) || proposals.length === 0) return null
  const normalized = proposals.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const p = raw as Record<string, unknown>
    if (typeof p.title !== 'string' || !p.title.trim()) return []
    if (typeof p.description !== 'string' || !p.description.trim()) return []
    if (typeof p.prompt !== 'string' || !p.prompt.trim()) return []
    return [
      {
        id: typeof p.id === 'string' && p.id.trim() ? p.id : `proposal-${Math.random().toString(36).slice(2, 7)}`,
        title: p.title.trim().slice(0, 120),
        description: p.description.trim().slice(0, 220),
        prompt: p.prompt.trim().slice(0, 500),
      } satisfies GuardProposal,
    ]
  })
  if (normalized.length === 0) return null

  const intent = typeof statedJourneyIntent === 'string' ? statedJourneyIntent.trim() : ''
  if (!intent) {
    // Still drop pure homepage uptime cards when other proposals exist.
    const withoutWeak = normalized.filter((p) => !isWeakHomepageProposal(p))
    return (withoutWeak.length >= 2 ? withoutWeak : normalized).slice(0, 3)
  }

  const fr = (options?.preferredLanguage ?? 'en') === 'fr'
  const destination = options?.destinationUrl ?? null
  const withoutWeak = normalized.filter((p) => !isWeakHomepageProposal(p))
  const pool = withoutWeak.length > 0 ? withoutWeak : normalized

  const honored = pool.filter((p) => proposalHonorsStatedIntent(p, intent))
  if (honored.length > 0) {
    const rest = pool.filter((p) => p !== honored[0] && !isWeakHomepageProposal(p))
    return [honored[0]!, ...rest].slice(0, 3)
  }

  const repaired = repairProposalFromIntent(intent, destination, fr)
  const rest = pool.filter((p) => !isWeakHomepageProposal(p)).slice(0, 2)
  if (rest.length === 0 && destination) {
    rest.push({
      id: 'intent-alt-page',
      title: fr ? 'Contrôler la page destination' : 'Check the destination page',
      description: fr
        ? `Vérifier que la page fournie charge et affiche le contenu attendu.`
        : `Verify the provided page loads and shows the expected content.`,
      prompt: fr
        ? `Ouvrir ${destination} et vérifier le contenu clé (sans contrôler seulement l’accueil).`
        : `Open ${destination} and verify key content (not homepage-only).`,
    })
  }
  return [repaired, ...rest].slice(0, 3)
}
