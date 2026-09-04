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
 * User accepts the current plan without edits — not launch, not correction.
 * Covers FR/EN and casual mixes (« oui c'est bon », « c'est good », « sounds good »).
 * Product rule: approval must short-circuit before any iterate / dry-run / re-plan.
 */
export function looksLikePlanApprovalOnly(text: string): boolean {
  const raw = text.trim()
  if (!raw || raw.length > 160) return false
  if (/^(non|no)\b/i.test(raw)) return false
  if (
    /\b(change|modifi|ajout|supprim|corrige|retire|enl[eè]ve|wrong|pas bon|il manque|manque|ajoute|before|avant)\b/i.test(
      raw,
    )
  ) {
    return false
  }
  if (
    /\b(lance|lancer|exécute|execute|run|start|démarre|demarre|relance|relancer)\b/i.test(raw)
  ) {
    return false
  }

  const n = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.!…]+$/g, '')
    .trim()

  // Single-token / short affirmations
  if (
    /^(oui|ouais|yes|yep|yeah|ok|okay|parfait|nickel|tres bien|d'accord|daccord|sure|exact|exactement|valide|approved|fine|great)$/.test(
      n,
    )
  ) {
    return true
  }

  // « c'est bon / c'est good / it's good / that's fine » (+ optional oui/ok)
  if (
    /^(oui|yes|ok|okay)?\s*,?\s*(c'est|ca|it'?s|that'?s|thats)\s+(bon|bien|good|parfait|nickel|ok|okay|fine|great|marche)$/.test(
      n,
    )
  ) {
    return true
  }

  // « ok parfait », « oui nickel »
  if (/^(oui|yes|ok|okay)\s*,?\s+(parfait|nickel|bon|bien|good|fine|great)$/.test(n)) {
    return true
  }

  // Bare « c'est bon » without subject already covered; also « bon pour moi »
  if (/^(c'est\s+)?(bon|bien|good)(\s+pour\s+moi)?$/.test(n)) return true

  // « ça me va », « sounds/looks/all/seems good », « we're good »
  if (/^ca\s+me\s+va$/.test(n)) return true
  if (/^(sounds|looks|all|seems)\s+good$/.test(n)) return true
  if (/^(on est bon|we'?re good|good for me|looks good)$/.test(n)) return true

  if (
    /\b(me convient|convient|no changes|pas de changement|rien a (changer|modifier)|nothing to change)\b/.test(
      n,
    )
  ) {
    return true
  }

  return false
}

/** Settled plan + approval only — skip re-explore / dry-run on iterate. */
export function isSettledPlanApprovalTurn(input: {
  mode: string
  userMessage: string
  currentSteps?: Array<{ label?: string; action?: string }> | null
}): boolean {
  if (input.mode !== 'iterate') return false
  const steps = input.currentSteps
  if (!Array.isArray(steps) || steps.length === 0) return false
  return looksLikePlanApprovalOnly(input.userMessage)
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
 * User rejects download / submit and wants field-fill / validation only.
 * « Je ne veux pas télécharger… seulement tester les champs » must NOT keep a download intent.
 */
export function isFillFieldsWithoutSubmitAsk(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const rejectsDownloadOrSubmit =
    /(?:ne\s+(?:veux|veut|voulais|souhaite|souhaitez|voudrais)\s+pas|pas\s+(?:envie|besoin)\s+de|sans|without|don't|do\s+not|no\s+need\s+to)\s+(?:[^\n.!?]{0,40}?)?(?:télécharg\w*|download\w*|soumett\w*|submit\w*|envoy\w*|envoyer)/i.test(
      t,
    ) ||
    /(?:pas|sans|without)\s+(?:de\s+|d['’])?(?:téléchargement|download|soumission|submit)/i.test(t)
  const wantsFields =
    /(?:seulement|uniquement|only|juste|just)\s+(?:tester\s+|remplir\s+|fill(?:ing)?\s+)?(?:les\s+|the\s+)?(?:champs|fields|saisie|formulaire|form\b)/i.test(
      t,
    ) ||
    /(?:tester|test(?:er)?|remplir|fill(?:ing)?|valider|validate)\s+(?:les\s+|the\s+)?(?:champs|fields|saisie|formulaire|form\b)/i.test(
      t,
    ) ||
    /(?:champs|fields)\s+(?:de\s+)?(?:saisie|input|information)/i.test(t)
  return rejectsDownloadOrSubmit || (wantsFields && /télécharg|download|brochure|soumett|submit/i.test(t) && rejectsDownloadOrSubmit)
}

/** Normalized intent when the user pivots to form-fill without download/submit. */
export function fillFieldsOnlyIntent(preferredLanguage?: string | null): string {
  return preferredLanguage === 'fr' || preferredLanguage == null
    ? 'Remplir / tester les champs du formulaire sans télécharger ni soumettre'
    : 'Fill / test the form fields without downloading or submitting'
}

/** True for a fill-only ask OR the normalized fill-only intent string. */
export function isFillOnlyJourneyIntent(text: string | null | undefined): boolean {
  const t = typeof text === 'string' ? text.trim() : ''
  if (!t) return false
  if (isFillFieldsWithoutSubmitAsk(t)) return true
  return (
    /sans\s+(?:télécharg|download|soumett|submit)|without\s+(?:download|submit)/i.test(t) &&
    /remplir|fill|tester|test|champ|field|saisie|formulaire/i.test(t)
  )
}

/** Coarse journey outcomes used for structural conflict checks (not phrase lists). */
export type JourneyOutcomeKind =
  | 'download'
  | 'submit'
  | 'login'
  | 'fill'
  | 'search'
  | 'cart'
  | 'booking'

const OUTCOME_KIND_RE: Record<JourneyOutcomeKind, RegExp> = {
  download: /t[eé]l[eé]charg|download|livre\s*blanc|white\s*paper/i,
  submit: /soumett|submit|envoy(er)?|send\s+(the\s+)?form|je\s+valide/i,
  login:
    /connex(?:ion|er)?|se\s+connecter|login|sign[\s-]?in|log[\s-]?in|mot\s+de\s+passe|password/i,
  fill: /remplir|fill(?:ing)?|champ|field|saisie|formulaire|\bform\b|tester\s+(?:les\s+)?champs/i,
  search: /recherch|search/i,
  cart: /panier|cart|checkout|acheter|achat|\bbuy\b|\border\b/i,
  booking: /r[eé]serv|book(?:ing)?/i,
}

export type JourneyOutcomeSignals = {
  positive: JourneyOutcomeKind[]
  negative: JourneyOutcomeKind[]
}

const OUTCOME_KINDS = Object.keys(OUTCOME_KIND_RE) as JourneyOutcomeKind[]

/**
 * Extract affirmed vs rejected journey outcomes from a turn.
 * Structural (negation window + outcome kind) — not tied to one French sentence.
 */
export function extractJourneyOutcomeSignals(text: string): JourneyOutcomeSignals {
  const t = text.trim()
  if (!t) return { positive: [], negative: [] }

  const positive = new Set<JourneyOutcomeKind>()
  const negative = new Set<JourneyOutcomeKind>()

  // Negation cue + outcome within a short window (FR/EN).
  const negationWindow =
    /(?:ne\s+(?:veux|veut|voulais|souhaite|souhaitez|voudrais|veux)\s+pas|pas\s+(?:envie|besoin)\s+de|sans|without|don't|do\s+not|no\s+need\s+to|stop|arr[eê]te(?:r)?|plus\s+de|no\s+more)\s+[^\n.!?]{0,60}/gi

  for (const kind of OUTCOME_KINDS) {
    const re = OUTCOME_KIND_RE[kind]
    let negated = false
    for (const m of t.matchAll(negationWindow)) {
      if (re.test(m[0] ?? '')) {
        negative.add(kind)
        negated = true
      }
    }
    // Bare “pas/sans de téléchargement|download|…”
    if (
      new RegExp(
        String.raw`(?:pas|sans|without)\s+(?:de\s+|d['’])?(?:${re.source})`,
        'i',
      ).test(t)
    ) {
      negative.add(kind)
      negated = true
    }
    if (!negated && re.test(t)) positive.add(kind)
  }

  // Restrictive “only fill fields” while talking about a prior download/submit journey.
  if (
    /(?:seulement|uniquement|only|juste|just)\s+(?:[^\n.!?]{0,40}?)?(?:champ|field|saisie|formulaire|remplir|fill)/i.test(
      t,
    ) &&
    /t[eé]l[eé]charg|download|brochure|soumett|submit|envoy/i.test(t)
  ) {
    negative.add('download')
    negative.add('submit')
    positive.add('fill')
  }

  return { positive: [...positive], negative: [...negative] }
}

/** True when the latest turn rejects an outcome that the prior text/plan still affirms. */
export function journeyOutcomesConflict(prior: string, latest: string): boolean {
  const a = extractJourneyOutcomeSignals(prior)
  const b = extractJourneyOutcomeSignals(latest)
  if (b.negative.some((k) => a.positive.includes(k))) return true
  if (a.negative.some((k) => b.positive.includes(k))) return true
  // Latest restricts to fill-only while prior was download/submit-led.
  if (
    b.positive.includes('fill') &&
    b.negative.some((k) => k === 'download' || k === 'submit') &&
    a.positive.some((k) => k === 'download' || k === 'submit')
  ) {
    return true
  }
  return false
}

export function planContradictsStatedIntent(
  steps: Array<{ label: string; action: string; targetHint?: string }> | null | undefined,
  intentText: string,
): boolean {
  if (!steps?.length || !intentText.trim()) return false
  const { negative } = extractJourneyOutcomeSignals(intentText)
  if (negative.length === 0) return false
  const blob = steps.map((s) => `${s.action} ${s.label} ${s.targetHint ?? ''}`).join('\n')
  return negative.some((kind) => OUTCOME_KIND_RE[kind].test(blob))
}

/**
 * Settled plan must not survive a mid-chat outcome revision.
 * Triggered by structural conflict (negated outcome / restrictive pivot), not one stock phrase.
 */
export function shouldInvalidateSettledPlan(options: {
  latestMessage: string
  seed?: string | null
  planSteps?: Array<{ label: string; action: string; targetHint?: string }> | null
}): boolean {
  const latest = options.latestMessage.trim()
  if (!latest) return false

  const latestSignals = extractJourneyOutcomeSignals(latest)
  if (latestSignals.negative.length === 0 && !isFillOnlyJourneyIntent(latest)) {
    // Soft revise without negation: new concrete outcome vs seed still counts when they conflict.
    const seed = options.seed?.trim() ?? ''
    if (!seed || !summarizeStatedJourneyIntent(latest)) return false
    return journeyOutcomesConflict(seed, latest)
  }

  if (options.planSteps?.length && planContradictsStatedIntent(options.planSteps, latest)) {
    return true
  }
  if (options.seed?.trim() && journeyOutcomesConflict(options.seed, latest)) {
    return true
  }
  return false
}

export function stepMatchesRejectedOutcomes(
  step: { label: string; action: string; targetHint?: string },
  rejected: JourneyOutcomeKind[],
): boolean {
  if (rejected.length === 0) return false
  const blob = `${step.action} ${step.label} ${step.targetHint ?? ''}`
  const interactive = /(click|cliquer|clique|select|choisis|soumett|submit|envoy)/i.test(blob)
  const verify = /(verify|v[eé]rif|check|wait)/i.test(blob)
  return rejected.some((kind) => {
    if (!OUTCOME_KIND_RE[kind].test(blob)) return false
    if (kind === 'fill' || kind === 'search') return false
    return interactive || verify
  })
}

/**
 * Prefer the latest turn when it revises the goal (e.g. cancels download).
 * Falls back to seed intent when the latest message has no journey outcome.
 */
export function resolveStatedJourneyIntent(
  latestMessage: string,
  seed?: string | null,
  preferredLanguage?: string | null,
): string | null {
  const latest = latestMessage.trim()
  if (latest && isFillFieldsWithoutSubmitAsk(latest)) {
    return fillFieldsOnlyIntent(preferredLanguage ?? (/[àâäéèêëïîôùûüç]/i.test(latest) ? 'fr' : 'en'))
  }
  return summarizeStatedJourneyIntent(latest) ?? summarizeStatedJourneyIntent(seed ?? '')
}

/**
 * User already named a concrete journey outcome (beyond brand / URL alone).
 * Used so proposals #1 must honor that ask after site confirm — not generic templates.
 *
 * A deep URL path alone is a DESTINATION (where), not an outcome (what).
 * e.g. https://www.hetic.net/brochure does NOT imply “télécharger la brochure”.
 */
export function summarizeStatedJourneyIntent(text: string): string | null {
  const t = text.trim()
  if (!t || t.length < 3) return null
  if (looksLikeSiteConfirmation(t) || looksLikeSiteDecline(t) || looksLikeSocialChat(t)) {
    return null
  }

  // Explicit pivot: reject download/submit → fill fields only (do not keep “télécharger” as intent).
  if (isFillFieldsWithoutSubmitAsk(t)) {
    return fillFieldsOnlyIntent(/[àâäéèêëïîôùûüç]|je\s+ne|champs|saisie|formulaire/i.test(t) ? 'fr' : 'en')
  }

  // Strip URLs/domains so path tokens (…/brochure) never count as journey verbs.
  const withoutLocators = t
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(
      /\b(?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}(?:\/[^\s<>"']*)?/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (!withoutLocators || withoutLocators.length < 2) {
    // Message is only a URL / host — destination lives in context.url, not intent.
    return null
  }

  // Remove negated download/submit phrases so “ne veux pas télécharger” does not count as download.
  const withoutNegatedDownloads = withoutLocators
    .replace(
      /(?:ne\s+(?:veux|veut|voulais|souhaite|voudrais)\s+pas|pas\s+(?:envie|besoin)\s+de|sans|without|don't|do\s+not)\s+(?:[^\n.!?]{0,40}?)?(?:télécharg\w*|download\w*|soumett\w*|submit\w*|envoy\w*)/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  const forVerbCheck = withoutNegatedDownloads || withoutLocators

  const hasJourneyVerb =
    /\b(achat|acheter|commande|commander|panier|livraison|livrer|checkout|purchase|buy|buying|order|orders|cart|delivery|recherche|search|connexion|login|log[\s-]?in|inscription|signup|sign[\s-]?up|parcours|journey|monitorer|monitore|surveiller|surveille|réserver|reserver|book(?:ing)?|payer|pay|payment|tunnel|brochure|télécharger|telecharger|download|formulaire|devis|contact|essai|trial|demo|démo|vérif(?:ier)?|verify|check|remplir|fill|soumettre|submit|accessib|visible|affich|tester|test|champ|field|saisie)/i.test(
      forVerbCheck,
    )
  if (!hasJourneyVerb) return null

  // Prefer the full message (incl. URL) so the model keeps destination + outcome together.
  return t.length > 280 ? `${t.slice(0, 277)}…` : t
}

/** User explicitly wants journey ideas — keep the chooser. */
export function isAskingForJourneyIdeas(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /\b(quel(?:le)?s?\s+(?:parcours|idées|options?|chemins?)|which\s+(?:journey|path|route|option)s?|recommand|suggest(?:ion)?s?|propos(?:e|al)|des\s+idées|some\s+ideas|what\s+(?:journeys?|paths?|options?))\b/i.test(
    t,
  )
}

/**
 * Concrete destination or outcome detail beyond a bare brand / homepage.
 * « surveiller Amazon » → false ; « palmarès en sélection nationale » → true.
 */
export function hasConcreteJourneyDetail(text: string): boolean {
  const t = text.trim()
  if (!t) return false

  if (intentFromDeepLocator(t)) return true
  if (/[«"']([^«"']{4,})[»"']/.test(t)) return true

  // Named entity — no trailing \b after accented names (é breaks \b in JS).
  if (
    /\b(?:de|du|des|d['’]|sur\s+la\s+page\s+de|page\s+(?:de|du))\s+[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,3}/iu.test(
      t,
    )
  ) {
    return true
  }
  if (/\b[A-ZÀ-Ü][\p{L}'’.-]+(?:\s+[A-ZÀ-Ü][\p{L}'’.-]+)+/u.test(t)) return true

  if (
    /\b(?:son|sa|ses|leur|leurs|its|their|my|mon|ma|mes|ton|ta|tes)\s+[\p{L}][\p{L}\d-]{3,}/iu.test(
      t,
    )
  ) {
    return true
  }

  if (
    /\b(?:section|rubrique|onglet|fiche|article|palmarès|palmares|statistiques|stats|brochure|formulaire|panier|checkout|téléchargement|download|livraison|commande|connexion|login|inscription|signup|devis|contact|essai|trial|d[eé]mo|r[eé]serv|book(?:ing)?|jusqu['’]?à)\b/i.test(
      t,
    )
  ) {
    return true
  }

  if (/\b(?:page|contenu|fiche|article)\s+(?:de|du|des|sur)\s+/i.test(t)) return true
  if (/\b(?:wikipédia|wikipedia|wiki)\b/i.test(t) && /\b(?:de|du|des|d['’])\s+/i.test(t)) {
    return true
  }

  return false
}

/**
 * Skip « Choisir un parcours » when the user already gave enough to build one journey:
 * stated outcome + concrete detail — not when they only named a brand (« surveiller Amazon »).
 */
export function shouldSkipJourneyChooser(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 16) return false
  if (
    looksLikeSocialChat(t) ||
    looksLikeSiteConfirmation(t) ||
    looksLikeSiteDecline(t) ||
    isAskingForJourneyIdeas(t)
  ) {
    return false
  }

  const stated = summarizeStatedJourneyIntent(t)
  if (!stated) return false
  if (!hasConcreteJourneyDetail(t)) return false

  return true
}

/** @deprecated Prefer shouldSkipJourneyChooser — kept for call-site compatibility. */
export function isFullySpecifiedMonitoringAsk(text: string): boolean {
  return shouldSkipJourneyChooser(text)
}

/**
 * Well-known public sites named without a URL — avoids slow/failing brand resolve
 * (e.g. « wikipédia » → fr.wikipedia.org).
 */
export function canonicalSiteUrlFromText(
  text: string,
  preferredLanguage?: 'en' | 'fr' | null,
): string | null {
  const t = text.trim()
  if (!t) return null
  const fr = preferredLanguage !== 'en'

  if (/\b(wikipédia|wikipedia)\b/i.test(t)) {
    return fr ? 'https://fr.wikipedia.org' : 'https://en.wikipedia.org'
  }

  return null
}

/**
 * Extract the deep destination URL/path from user text (where to monitor).
 * Does NOT invent a journey outcome from the path slug.
 */
export function intentFromDeepLocator(text: string): string | null {
  const raw =
    text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,);]+$/g, '') ??
    text.match(/\b(?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,}(\/[^\s]*)/i)?.[0]
  if (!raw) return null
  try {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const u = new URL(href)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    if (path === '/' && !u.search && !u.hash) return null
    return `Destination ${u.origin}${path}${u.search}${u.hash}`.slice(0, 280)
  } catch {
    return null
  }
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
