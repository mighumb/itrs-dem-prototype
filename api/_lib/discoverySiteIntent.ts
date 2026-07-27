/**
 * Shared heuristics for Discovery site targeting / confirmation.
 * Imported by the API handler and the client (src/lib/discoveryAi).
 * Keep this file free of Node-only or browser-only APIs.
 */

/** Ultra-short social / ping only — multi-word phrases like « Bonne nuit » may still be brand candidates. */
const SOCIAL_CHAT_RE =
  /^(hi|hello|hey|yo|bonjour|bonsoir|salut|coucou|hello\s+there|hey\s+there|à\s+bientôt|a\s+bientot|bye|goodbye|ciao|merci|thanks|thank\s+you|ok|oui|non|ping|test|essai|aide|help)([.!?…\s]*)$/i

const ACRONYM_NOISE_RE =
  /^(OK|KO|LOL|MDR|WTF|FYI|ASAP|PDF|FAQ|IMO|BTW|IDK)$/i

/** Intent / confirm tokens that must never be treated as a brand name. */
const BRAND_BLOCKLIST_RE =
  /^(parcours|journey|journeys|site|sites|idées|ideas|aide|help|test|essai|chat|monitoring|surveillance|ok|oui|non|parfait|nickel|go|sure|exact|okay|merci|thanks|ping|achat|produit|commande|livraison|panier|order|purchase|buy|product|delivery|checkout|et|ou|and|or|en|sur|par|chez|sous|aux|au|ce|ces|cette|mon|ma|mes|ton|ta|tes|son|sa|ses|nos|vos|leur|leurs|ne|pas|plus|très|tres|bien|aussi|comme|que|qui|dont|où|ou|y|dès|des|du|de|la|le|les|un|une|the|a|an|to|for|of|on|in|at|by|from|with|into|over|under|via|web|www)$/i

const INTENT_ONLY_RE =
  /^(je\s+veux|j['’]aimerais|i\s+want|i['’]d\s+like|un\s+parcours|des\s+idées|des\s+parcours|construisons(?:\s+un\s+parcours)?|test\s+chat|aide[- ]moi|help\s+me|un\s+site|montre[- ]moi|des\s+idées)$/i

/**
 * Strip product / journey vocabulary so a sentence like
 * « achat d'un produit {marque} jusqu'à la livraison » keeps only the brand token.
 */
const INTENT_STOPWORD_RE =
  /\b(je|j|tu|on|nous|vous|ils|elles|me|moi|te|toi|se|veux|voudrais|aimerais|besoin|faire|créer|cree|construire|construisons|build|create|make|start|commencer|surveiller|monitor(?:er|ing)?|parcours|journey|journeys|site|website|web|www|pour|avec|de|du|des|le|la|les|un|une|et|ou|and|or|then|puis|en|sur|par|chez|sous|aux|au|ce|ces|cette|mon|ma|mes|ton|ta|tes|son|sa|ses|ne|pas|plus|très|tres|bien|aussi|comme|que|qui|dont|the|a|an|to|for|of|on|in|at|by|from|with|into|over|under|via|dans|please|svp|aide[- ]?moi|help\s+me|i\s+want|i'd\s+like|can\s+you|could\s+you|quel(?:le)?s?|what|which|aujourd['’]?hui|today|achat|acheter|produit|produits|commande|commandes|livraison|livrer|panier|checkout|cart|order|orders|purchase|buy|buying|product|products|delivery|until|jusqu(?:['’]?à)?|vers|avant|après|complete|complet|complète|full)\b/gi

/** Explicit URL / domain — unambiguous monitoring target. */
export function hasExplicitSiteLocator(text: string): boolean {
  const t = text.trim()
  return (
    /https?:\/\/[^\s]+/i.test(t) ||
    /\b(?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\/[^\s]*)?\b/i.test(t)
  )
}

/** "monitor EasyJet" / "surveiller Amazon" — clear monitoring intent + name. */
export function hasMonitorVerbWithTarget(text: string): boolean {
  return /\b(?:monitor(?:er|ing)?|surveill(?:er|ance)?|parcours(?:\s+(?:sur|pour))?|journey(?:\s+(?:on|for))?|check(?:er)?)\s+[\wÀ-ü][\wÀ-ü&'.-]{1,}/i.test(
    text.trim(),
  )
}

/** Pure social / ping — not a brand and not monitoring intent. */
export function looksLikeSocialChat(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 60) return false
  return SOCIAL_CHAT_RE.test(t)
}

/** User affirming a previously proposed site candidate. */
export function looksLikeSiteConfirmation(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 80) return false
  if (
    /^(oui|ouais|yes|yep|yeah|yup|ok|okay|d['’]?accord|exact|exactement|sure|confirme(?:d)?|vas[- ]y|go|nickel|parfait)([.!]|$)/i.test(
      t,
    )
  ) {
    return true
  }
  if (
    /^(oui|yes|ok)\b.{0,48}$/i.test(t) &&
    /\b(c['’]?est\s+(?:ça|bien|bon|celui)|celui[- ]là|ce\s+site|that(?:'s|\s+is)\s+(?:it|right)|correct)\b/i.test(
      t,
    )
  ) {
    return true
  }
  return false
}

/**
 * User declining a site candidate (soft form or free text).
 * Used after brand_resolve confirmation — must not open journey proposals.
 */
export function looksLikeSiteDecline(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 200) return false
  if (hasExplicitSiteLocator(t) || hasMonitorVerbWithTarget(t)) return false
  if (
    /^(non|no|nope|nan|pas\s+du\s+tout|no\s+thanks|non\s+merci)([.!]|$)/i.test(t)
  ) {
    return true
  }
  if (
    /^(non|no|nan)\b/i.test(t) &&
    /\b(juste|just|souhait|greeting|salut|bonjour|bonsoir|bonne\s+nuit|good\s+night|pas\s+(?:ça|ce\s+site|celui)|wrong|autre|not\b|c['’]était|cetait)\b/i.test(
      t,
    )
  ) {
    return true
  }
  // Clarification that the prior turn was only a greeting/wish — not a site to monitor.
  // Must match without requiring a leading "non" (e.g. « c'était juste un souhait »).
  if (
    /\b(?:juste\s+(?:un\s+)?souhait|c['’]?était\s+juste|cetait\s+juste|just\s+(?:a\s+)?(?:wish|greeting)|je\s+(?:te|vous)\s+souhait|only\s+(?:a\s+)?(?:greeting|wish)|pas\s+une\s+marque)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (
    /\b(?:pas\s+(?:ce\s+)?site|wrong\s+site|autre\s+site|ce\s+n['’]est\s+pas|not\s+(?:that|this|it)|non[,\s]+autre)\b/i.test(
      t,
    )
  ) {
    return true
  }
  return false
}

function brandishLeftover(text: string): string {
  return text
    .replace(INTENT_STOPWORD_RE, ' ')
    .replace(/\s*&\s*/g, ' ')
    .replace(/[^\p{L}\p{N}.'-]+/gu, ' ')
    .trim()
}

function compactToken(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
}

/**
 * Individual leftover brand words after stripping journey vocabulary
 * (no joining yet).
 */
function extractBrandishWords(text: string): string[] {
  const leftover = brandishLeftover(text)
  if (!leftover) return []
  return leftover
    .split(/\s+/)
    .map((w) => w.replace(/^['’]+|['’]+$/g, ''))
    .filter((w) => {
      if (!w || BRAND_BLOCKLIST_RE.test(w)) return false
      const compact = w.replace(/\./g, '')
      if (compact.length < 2) return false
      if (compact.length >= 4) return true
      if (/^[A-ZÀ-Ü]{2,3}$/u.test(compact)) return true
      if (/^[A-ZÀ-Ü][a-zà-ü]{2,}$/u.test(w)) return true
      return false
    })
}

/**
 * Glue articles that belong to the brand in the original sentence.
 * "La poste" → laposte ; "Le Figaro" → lefigaro.
 * This is one input to joining — not the only brand strategy.
 */
function extractArticleGluedCompounds(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  // "La Poste", "Le Figaro", "L'Oréal" / "L’Oréal" (apostrophe, optional space)
  const re =
    /\b(?:(la|le|les|the)\s+|(l['’])\s*)([\p{L}][\p{L}0-9'.-]{2,40})\b/giu
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const articleRaw = match[1] || match[2] || ''
    const article = articleRaw.replace(/['’]/g, '').toLowerCase()
    const rest = match[3]
    if (!article || !rest || BRAND_BLOCKLIST_RE.test(rest)) continue
    const restCompact = compactToken(rest)
    if (restCompact.length < 2) continue
    if (restCompact.length < 4 && !/^[A-ZÀ-Ü]/.test(rest)) continue
    const compound = `${article}${restCompact}`
    if (compound.length < restCompact.length + 1) continue
    if (seen.has(compound)) continue
    seen.add(compound)
    out.push(compound)
  }
  return out
}

/**
 * Multi-word leftovers → joined host forms.
 * "Crédit Agricole" → creditagricole ; "British Airways" → britishairways.
 * Also keeps hyphenated form when useful for seeding.
 */
function extractJoinedWordCompounds(words: string[]): string[] {
  if (words.length < 2) return []
  const parts = words.map(compactToken).filter((p) => p.length >= 2)
  if (parts.length < 2) return []
  const joined = parts.join('')
  const hyphenated = parts.join('-')
  const out: string[] = []
  if (joined.length >= 5) out.push(joined)
  if (hyphenated.length >= 5 && hyphenated !== joined) out.push(hyphenated)
  return out
}

/**
 * Drop short leftovers that are only fragments of a longer brand token we
 * already have. Prevents seeding poste.fr when laposte exists, or
 * agricole.fr when creditagricole exists — for ANY brand, not just articles.
 */
export function dominantBrandTokens(tokens: string[]): string[] {
  const items = tokens
    .map((t) => ({ t, c: compactToken(t) }))
    .filter(({ c }) => c.length >= 2)
  return items
    .filter(
      ({ c }) =>
        !items.some(
          (other) => other.c !== c && other.c.includes(c) && other.c.length > c.length,
        ),
    )
    .map(({ t }) => t)
}

/** @deprecated Use extractBrandishTokens — kept as alias for older call sites. */
export function extractArticleBrandCompounds(text: string): string[] {
  return extractArticleGluedCompounds(text)
}

/**
 * Brand / org tokens left after stripping journey vocabulary.
 * Includes joined multi-word forms and article-glued forms.
 * Callers that invent hosts MUST run dominantBrandTokens() first.
 */
export function extractBrandishTokens(text: string): string[] {
  const words = extractBrandishWords(text)
  const compounds = [
    ...extractArticleGluedCompounds(text),
    ...extractJoinedWordCompounds(words),
  ]

  const out: string[] = []
  const seen = new Set<string>()
  // Longer / joined forms first.
  for (const token of [...compounds, ...words]) {
    const key = compactToken(token)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(token)
  }
  return out
}

/** Short brand / acronym / org name without URL — resolve, then confirm before proposals. */
export function looksLikeAmbiguousBrandName(text: string): boolean {
  const t = text.trim()
  if (!t || hasExplicitSiteLocator(t) || hasMonitorVerbWithTarget(t)) return false
  if (
    looksLikeSocialChat(t) ||
    looksLikeSiteConfirmation(t) ||
    looksLikeSiteDecline(t) ||
    INTENT_ONLY_RE.test(t)
  ) {
    return false
  }
  const words = extractBrandishTokens(t)
  // After stopword stripping, a journey sentence collapses to the brand
  // (« … {marque} … livraison » → ["marque"]). Cap keeps multi-word orgs.
  if (words.length === 0 || words.length > 4) return false
  const leftover = words.join(' ')
  const letters = leftover.replace(/[^A-Za-zÀ-ü]/g, '')
  if (/^[A-ZÀ-Ü]{2,6}$/.test(letters) && !ACRONYM_NOISE_RE.test(letters)) return true
  if (/^(?:la|le|l['’]|les|the|el|die)\s+[A-Za-zÀ-ü][A-Za-zÀ-ü'.-]{1,40}$/i.test(t)) {
    return true
  }
  if (words.every((w) => /^[\p{L}'.-]{2,}$/u.test(w))) {
    return true
  }
  return false
}

/** True when a resolved hostname literally contains a user-named brand token. */
export function hostnameMatchesBrandTokens(
  urlOrHost: string | null | undefined,
  text: string,
): boolean {
  if (!urlOrHost) return false
  const tokens = extractBrandishTokens(text)
  if (tokens.length === 0) return false
  let host = urlOrHost.trim().toLowerCase()
  try {
    if (/^https?:\/\//i.test(host)) {
      host = new URL(host).hostname
    }
  } catch {
    return false
  }
  host = host.replace(/^www\./, '')
  return tokens.some((token) => {
    const compact = token.toLowerCase().replace(/[^a-z0-9]/g, '')
    return compact.length >= 3 && host.includes(compact)
  })
}

/** True when this turn should resolve/crawl a site — not on casual chat. */
export function messageRequestsSiteWork(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (looksLikeSocialChat(t) || looksLikeSiteConfirmation(t) || looksLikeSiteDecline(t)) {
    return false
  }
  if (hasExplicitSiteLocator(t) || hasMonitorVerbWithTarget(t)) return true
  return looksLikeAmbiguousBrandName(t)
}

/**
 * User already named a concrete journey outcome (beyond brand alone).
 * Used so proposals #1 must honor that ask after site confirm — not generic templates.
 */
export function summarizeStatedJourneyIntent(text: string): string | null {
  const t = text.trim()
  if (!t || t.length < 10) return null
  if (looksLikeSiteConfirmation(t) || looksLikeSiteDecline(t) || looksLikeSocialChat(t)) {
    return null
  }
  const hasJourneyVerb =
    /\b(achat|acheter|commande|commander|panier|livraison|livrer|checkout|purchase|buy|buying|order|orders|cart|delivery|recherche|search|connexion|login|log[\s-]?in|inscription|signup|sign[\s-]?up|parcours|journey|réserver|reserver|book(?:ing)?|payer|pay|payment|tunnel)\b/i.test(
      t,
    )
  if (!hasJourneyVerb) return null
  // Brand-only leftovers like "Asos" / "monitor Boohoo" without a journey outcome → null
  const withoutBrand = brandishLeftover(t)
  if (!withoutBrand && !hasJourneyVerb) return null
  return t.length > 280 ? `${t.slice(0, 277)}…` : t
}

/** Any answer string in a map looks like a site decline. */
export function answersIncludeSiteDecline(
  answers: Record<string, string> | null | undefined,
): boolean {
  if (!answers) return false
  return Object.values(answers).some(
    (value) => typeof value === 'string' && looksLikeSiteDecline(value),
  )
}
