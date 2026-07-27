/**
 * Shared heuristics for Discovery site targeting / confirmation.
 * Imported by the API handler and the client (src/lib/discoveryAi).
 * Keep this file free of Node-only or browser-only APIs.
 */

const SOCIAL_CHAT_RE =
  /^(hi|hello|hey|yo|bonjour|bonsoir|salut|coucou|bonne\s+nuit|bonnes?\s+nuits?|good\s+night|good\s+morning|good\s+afternoon|good\s+evening|hello\s+there|hey\s+there|à\s+bientôt|a\s+bientot|bye|goodbye|ciao|merci|thanks|thank\s+you|ok|oui|non|ping|test|essai|aide|help)([.!?…\s]*)$/i

const ACRONYM_NOISE_RE =
  /^(OK|KO|LOL|MDR|WTF|FYI|ASAP|PDF|FAQ|IMO|BTW|IDK)$/i

/** Intent / confirm tokens that must never be treated as a brand name. */
const BRAND_BLOCKLIST_RE =
  /^(parcours|journey|journeys|site|sites|idées|ideas|aide|help|test|essai|chat|monitoring|surveillance|ok|oui|non|parfait|nickel|go|sure|exact|okay|merci|thanks|ping|nuit|night|matin|morning|soir|evening)$/i

const INTENT_ONLY_RE =
  /^(je\s+veux|j['’]aimerais|i\s+want|i['’]d\s+like|un\s+parcours|des\s+idées|des\s+parcours|construisons(?:\s+un\s+parcours)?|test\s+chat|aide[- ]moi|help\s+me|un\s+site|montre[- ]moi|des\s+idées)$/i

const INTENT_STOPWORD_RE =
  /\b(je|j|tu|on|nous|vous|veux|voudrais|aimerais|besoin|faire|créer|cree|construire|construisons|build|create|make|start|commencer|surveiller|monitor(?:er|ing)?|parcours|journey|journeys|site|website|web|pour|avec|de|du|des|le|la|les|un|une|the|a|an|to|for|of|on|in|dans|please|svp|aide[- ]?moi|help\s+me|i\s+want|i'd\s+like|can\s+you|could\s+you|quel(?:le)?s?|what|which|aujourd['’]?hui|today)\b/gi

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
  const leftover = brandishLeftover(t)
  if (!leftover) return false
  const words = leftover.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 6) return false
  if (words.every((w) => BRAND_BLOCKLIST_RE.test(w))) return false
  const letters = leftover.replace(/[^A-Za-zÀ-ü]/g, '')
  if (/^[A-ZÀ-Ü]{2,6}$/.test(letters) && !ACRONYM_NOISE_RE.test(letters)) return true
  if (/^(?:la|le|l['’]|les|the|el|die)\s+[A-Za-zÀ-ü][A-Za-zÀ-ü'.-]{1,40}$/i.test(t)) {
    return true
  }
  if (
    words.length <= 3 &&
    words.every((w) => /^[\p{L}'.-]{2,}$/u.test(w)) &&
    !words.every((w) => BRAND_BLOCKLIST_RE.test(w))
  ) {
    return true
  }
  return false
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

/** Any answer string in a map looks like a site decline. */
export function answersIncludeSiteDecline(
  answers: Record<string, string> | null | undefined,
): boolean {
  if (!answers) return false
  return Object.values(answers).some(
    (value) => typeof value === 'string' && looksLikeSiteDecline(value),
  )
}
