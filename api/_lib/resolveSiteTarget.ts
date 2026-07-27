import { GoogleGenerativeAI } from '@google/generative-ai'
import { geminiModelCandidates } from './geminiModels.js'
import { analyzePublicSite, extractHttpUrl, type SiteAnalysisResult } from './analyzeSite.js'
import {
  extractBrandishTokens,
  extractArticleBrandCompounds,
  looksLikeSocialChat,
  messageRequestsSiteWork,
} from './discoverySiteIntent.js'

export type ResolvedSiteTarget = {
  /** URL we will/tried to inspect */
  url: string | null
  /** How we got it */
  source: 'explicit_url' | 'bare_domain' | 'brand_resolve' | 'none'
  /** Brand / site label when resolved from a name */
  label: string | null
  /** Human-readable note for workTrace / transparency */
  note: string | null
}

const BRAND_RESOLVE_TIMEOUT_MS = 14_000

function shouldTryBrandResolve(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 2) return false
  if (looksLikeSocialChat(t)) return false
  if (
    /^(hi|hello|hey|bonjour|salut|aide|help|coucou|test|ok)([.!?]|$)/i.test(t) &&
    t.split(/\s+/).length <= 2
  ) {
    return false
  }
  // Holistic resolve: journey sentences, monitor verbs, or leftover brand tokens.
  if (messageRequestsSiteWork(t)) return true
  if (extractBrandishTokens(t).length > 0) return true
  return /\b(achat|acheter|commande|livraison|purchase|order|buy|monitor|surveill|parcours|journey|website|site\s+web)\b/i.test(
    t,
  )
}

function compactBrandToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Prefer hosts that literally contain a user-named brand token. */
function brandHostScore(url: string, brandTokens: string[]): number {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    const labels = host.split('.')
    let best = 0
    for (const token of brandTokens) {
      const compact = compactBrandToken(token)
      if (compact.length < 2 || !host.includes(compact)) continue
      // Longer brand token wins over short preposition leftovers (asos ≫ sur).
      // Also: laposte ≫ poste when both match laposte.fr.
      let score = compact.length * 20
      if (labels.some((label) => label === compact)) score += 200
      if (host === `${compact}.com` || host === `${compact}.fr`) score += 50
      // Exact label match on a longer compound beats a shorter substring host
      // (laposte.fr with "laposte" vs poste.fr with "poste").
      if (labels[0] === compact) score += compact.length * 10
      best = Math.max(best, score)
    }
    return best
  } catch {
    return 0
  }
}

/** Short lowercase function words must never be seeded as www.{token}.fr. */
function isSeedableBrandToken(token: string): boolean {
  const compact = compactBrandToken(token)
  if (compact.length < 2) return false
  if (compact.length >= 4) return true
  if (/^[A-ZÀ-Ü]{2,3}$/u.test(token.replace(/\./g, ''))) return true
  if (/^[A-ZÀ-Ü][a-zà-ü]{2,}$/u.test(token)) return true
  return false
}

/** Error/login/auth subdomains are never a monitoring homepage. */
function isJunkResolvedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (
      /^(error|errors|err|login|signin|signup|auth|account|passport|sso|oauth)\./i.test(
        host,
      )
    ) {
      return true
    }
    return false
  } catch {
    return true
  }
}

/**
 * Deterministic homepage guesses from the named brand — tried before Search
 * so a bad grounding hit cannot invent an unrelated sibling host.
 */
function seedBrandHomepages(
  brandTokens: string[],
  preferredLanguage?: 'en' | 'fr' | null,
): Array<{ url: string; title: string | null }> {
  const out: Array<{ url: string; title: string | null }> = []
  const seen = new Set<string>()
  const push = (url: string) => {
    try {
      const key = new URL(url).hostname.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ url, title: null })
    } catch {
      /* ignore */
    }
  }
  const ordered = [...brandTokens].sort((a, b) => {
    const ca = compactBrandToken(a)
    const cb = compactBrandToken(b)
    return cb.length - ca.length
  })
  for (const token of ordered) {
    if (!isSeedableBrandToken(token)) continue
    const compact = compactBrandToken(token)
    if (preferredLanguage === 'fr') {
      push(`https://www.${compact}.fr`)
      push(`https://fr.${compact}.com`)
    }
    push(`https://www.${compact}.com`)
    push(`https://${compact}.com`)
  }
  return out
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

/** Prefer market-matching TLDs when ranking brand-resolve candidates. */
function localeUrlScore(url: string, preferredLanguage?: 'en' | 'fr' | null): number {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (preferredLanguage === 'fr') {
      if (host.endsWith('.fr')) return 100
      if (host.startsWith('fr.') || /(^|\.)fr\./.test(host)) return 95
      if (/^\/fr(\/|$)/.test(path) || path.includes('/fr-fr')) return 90
      if (host.endsWith('.be') || host.endsWith('.ch') || host.endsWith('.ca')) return 70
      if (host.endsWith('.us') || /(^|\.)us\./.test(host)) return 5
      if (host.endsWith('.com')) return 40
      return 20
    }
    if (preferredLanguage === 'en') {
      if (host.endsWith('.com') || host.endsWith('.co.uk') || host.endsWith('.com.au')) return 80
      if (host.endsWith('.us')) return 60
      return 40
    }
    return 50
  } catch {
    return 0
  }
}

function firstUrlFromText(text: string): string | null {
  return extractHttpUrl(text)
}

function urlsFromGrounding(response: {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
    }
  }>
}): Array<{ url: string; title: string | null }> {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const out: Array<{ url: string; title: string | null }> = []
  for (const chunk of chunks) {
    const uri = chunk.web?.uri
    if (!uri || !/^https?:\/\//i.test(uri)) continue
    out.push({ url: uri, title: chunk.web?.title ?? null })
  }
  return out
}

function parseHolisticBrandReply(text: string): {
  brand: string | null
  url: string | null
} {
  const trimmed = text.trim()
  if (!trimmed || /^none\b/i.test(trimmed)) {
    return { brand: null, url: null }
  }
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        brand?: unknown
        url?: unknown
        hostname?: unknown
      }
      const brand =
        typeof parsed.brand === 'string' && parsed.brand.trim()
          ? parsed.brand.trim()
          : null
      const rawUrl =
        typeof parsed.url === 'string'
          ? parsed.url
          : typeof parsed.hostname === 'string'
            ? parsed.hostname
            : null
      const url = rawUrl ? firstUrlFromText(rawUrl) ?? firstUrlFromText(`https://${rawUrl}`) : null
      return { brand, url }
    } catch {
      /* fall through */
    }
  }
  return { brand: null, url: firstUrlFromText(trimmed) }
}

function mergeBrandTokens(primary: string | null, heuristic: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const primaryExpanded =
    primary != null
      ? [primary, ...extractArticleBrandCompounds(primary), ...extractBrandishTokens(primary)]
      : []
  for (const token of [...primaryExpanded, ...heuristic]) {
    if (!token || !isSeedableBrandToken(token)) continue
    const key = compactBrandToken(token)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(token)
  }
  return out
}

async function pickBestBrandUrl(options: {
  brandTokens: string[]
  preferredLanguage?: 'en' | 'fr' | null
  fromModel: string | null
  grounded: Array<{ url: string; title: string | null }>
  labelHint: string | null
}): Promise<{ url: string | null; label: string | null; note: string | null }> {
  const { brandTokens, preferredLanguage, fromModel, grounded, labelHint } = options
  if (brandTokens.length === 0) {
    return {
      url: null,
      label: null,
      note: 'Could not identify a brand/site in the message',
    }
  }

  // Prefer model/search evidence over deterministic www.{token}.fr seeds —
  // seeds alone invented poste.fr for "La poste".
  const candidates = [
    ...(fromModel ? [{ url: fromModel, title: labelHint }] : []),
    ...grounded,
    ...seedBrandHomepages(brandTokens, preferredLanguage),
  ]
    .filter((c) => !isJunkResolvedHost(c.url))
    .map((c) => ({
      ...c,
      brand: brandHostScore(c.url, brandTokens),
      locale: localeUrlScore(c.url, preferredLanguage),
    }))
    .sort((a, b) => b.brand - a.brand || b.locale - a.locale)

  const seenHosts = new Set<string>()
  const unique: typeof candidates = []
  for (const c of candidates) {
    try {
      const host = new URL(c.url).hostname.toLowerCase()
      if (seenHosts.has(host)) continue
      seenHosts.add(host)
      unique.push(c)
    } catch {
      /* skip */
    }
  }

  // HARD RULE: never accept a host that does not contain the named brand tokens.
  const brandMatched = unique.filter((c) => c.brand > 0).slice(0, 8)
  if (brandMatched.length === 0) {
    return {
      url: null,
      label: labelHint,
      note: 'Could not resolve a confident official URL from the brand/name',
    }
  }

  let bestBotWall: {
    url: string
    title: string | null
    status: number
  } | null = null

  for (const candidate of brandMatched) {
    const probe = await analyzePublicSite(candidate.url)
    const finalUrl = probe.url || candidate.url

    // Redirected onto an off-brand host — skip; do NOT fall back to the
    // unproven original (that path proposed dead hosts like poste.fr).
    if (isJunkResolvedHost(finalUrl) || brandHostScore(finalUrl, brandTokens) === 0) {
      continue
    }

    if (probe.ok) {
      return {
        url: finalUrl,
        label: candidate.title ?? probe.title ?? labelHint,
        note: `Resolved brand/name to ${finalUrl}`,
      }
    }

    // Keep a FR bot-wall candidate only when the server actually responded
    // (HTTP status). Timeouts / network errors are never proposed.
    if (
      preferredLanguage === 'fr' &&
      localeUrlScore(candidate.url, 'fr') >= 90 &&
      brandHostScore(candidate.url, brandTokens) > 0 &&
      probe.status != null &&
      (probe.status === 401 || probe.status === 403 || probe.status >= 500)
    ) {
      if (!bestBotWall || brandHostScore(candidate.url, brandTokens) > brandHostScore(bestBotWall.url, brandTokens)) {
        bestBotWall = {
          url: candidate.url,
          title: candidate.title ?? labelHint,
          status: probe.status,
        }
      }
    }
  }

  if (bestBotWall) {
    return {
      url: bestBotWall.url,
      label: bestBotWall.title,
      note: `Resolved brand/name to ${bestBotWall.url} (FR market site responded HTTP ${bestBotWall.status}; page probe incomplete)`,
    }
  }

  return {
    url: null,
    label: labelHint,
    note: 'Could not resolve a reachable official URL from the brand/name',
  }
}

/**
 * Holistic brand→URL: read the full user sentence (like a chat LLM), extract the
 * intended brand, then validate/lock a matching official homepage.
 */
async function resolveBrandWithGemini(
  userText: string,
  apiKey: string,
  preferredLanguage?: 'en' | 'fr' | null,
): Promise<{ url: string | null; label: string | null; note: string | null }> {
  const heuristicTokens = extractBrandishTokens(userText)
  const genAI = new GoogleGenerativeAI(apiKey)
  const modelCandidates = geminiModelCandidates('free')

  const localeHint =
    preferredLanguage === 'fr'
      ? 'User language/market is French — MUST prefer the official French consumer site when it exists: .fr first, else fr.{brand}.com or {brand}.com/fr/ (e.g. amazon.fr, airbnb.fr, asos.fr, fr.asos.com). Do NOT default to the US/global .com if a FR market homepage exists.'
      : preferredLanguage === 'en'
        ? 'User language is English — prefer the primary consumer site for English-speaking markets when ambiguous.'
        : 'Prefer the primary official consumer homepage for the brand.'

  let lastError: unknown
  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ googleSearch: {} }] as never,
        systemInstruction: `You resolve a monitoring target from a natural-language user message (French or English).
Reason over the WHOLE sentence like a careful assistant — not like a keyword splitter.

Rules:
- Identify the brand / company / website the user wants to monitor.
- Keep articles that are part of the brand name (La Poste → laposte.fr, Le Figaro → lefigaro.fr, L'Oréal → loreal.com). Never strip "La/Le/The" and invent a leftover host (poste.fr is WRONG for La Poste).
- Ignore journey vocabulary and grammar words that are NOT part of the brand (achat, commande, livraison, sur, en, site, web, purchase, order, delivery, on, for, website…).
- Return THAT brand's official consumer homepage for the user's market.
- Never confuse sibling / parent-group / "related" properties the user did not name.
- Never return error/login/auth subdomains.
- Acronyms count (expand with Search when needed).
- If there is no brand/site (greeting, pure chat, vague "I want a journey" with no target), reply NONE.
- ${localeHint}

Reply with ONLY one line of JSON (no markdown, no commentary):
{"brand":"<Brand>","url":"https://..."}
or the single word NONE`,
      })

      const result = await model.generateContent(
        `User message to interpret as a monitoring target:\n"""${userText.trim()}"""`,
      )
      const text = result.response.text().trim()
      const holistic = parseHolisticBrandReply(text)
      if (!holistic.brand && !holistic.url && /^none\b/i.test(text.trim())) {
        return {
          url: null,
          label: null,
          note: 'No brand/site identified in the message',
        }
      }

      const brandTokens = mergeBrandTokens(holistic.brand, heuristicTokens)
      const grounded = urlsFromGrounding(result.response)
      return await pickBestBrandUrl({
        brandTokens,
        preferredLanguage,
        fromModel: holistic.url,
        grounded,
        labelHint: holistic.brand,
      })
    } catch (error) {
      lastError = error
      console.error(`[resolveSiteTarget] model ${modelName} failed`, error)
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'brand resolve failed'
  const seedTokens = mergeBrandTokens(null, heuristicTokens)
  if (seedTokens.length > 0) {
    const seeded = await pickBestBrandUrl({
      brandTokens: seedTokens,
      preferredLanguage,
      fromModel: null,
      grounded: [],
      labelHint: seedTokens[0] ?? null,
    })
    if (seeded.url) {
      return {
        ...seeded,
        note: `${seeded.note} (seed; Search unavailable: ${message})`,
      }
    }
  }

  return { url: null, label: null, note: `Brand resolve unavailable (${message})` }
}

/**
 * Resolve whatever the user typed into an inspectable site URL when possible:
 * explicit URL → bare domain → holistic brand/name via Gemini + Google Search grounding.
 */
export async function resolveSiteTarget(
  userText: string,
  options: {
    apiKey?: string | null
    /** Try these keys in order for brand resolve (quotas are often per project). */
    apiKeys?: string[] | null
    existingUrl?: string | null
    preferredLanguage?: 'en' | 'fr' | null
    /** When true, ignore leftover context.url and resolve from this message only. */
    preferMessageOverExisting?: boolean
  } = {},
): Promise<ResolvedSiteTarget> {
  // Always prefer an explicit URL/domain typed in THIS message.
  const fromMessage = extractHttpUrl(userText)
  if (fromMessage) {
    const hadProtocol = /https?:\/\//i.test(userText)
    return {
      url: fromMessage,
      source: hadProtocol ? 'explicit_url' : 'bare_domain',
      label: null,
      note: hadProtocol ? null : `Normalized domain to ${fromMessage}`,
    }
  }

  const keys = [
    ...(options.apiKeys ?? []),
    ...(options.apiKey ? [options.apiKey] : []),
  ].filter((key, index, all) => Boolean(key) && all.indexOf(key) === index)

  const tryResolve =
    keys.length > 0 &&
    shouldTryBrandResolve(userText) &&
    (options.preferMessageOverExisting || !options.existingUrl)

  if (tryResolve) {
    let lastNote: string | null = null
    let lastLabel: string | null = null
    for (const apiKey of keys) {
      const resolved = await withTimeout(
        resolveBrandWithGemini(userText, apiKey, options.preferredLanguage),
        BRAND_RESOLVE_TIMEOUT_MS,
        {
          url: null,
          label: null,
          note: 'Brand resolve timed out — continuing without a resolved URL',
        },
      )
      if (resolved.url) {
        return {
          url: resolved.url,
          source: 'brand_resolve',
          label: resolved.label,
          note: resolved.note,
        }
      }
      lastNote = resolved.note
      lastLabel = resolved.label
    }
    // Last resort: heuristic tokens → probe www.{brand}.fr/.com (never grammar leftovers).
    // HARD RULE: only return a seed that actually responds (probe.ok).
    const seeds = seedBrandHomepages(
      extractBrandishTokens(userText),
      options.preferredLanguage,
    )
    for (const seed of seeds) {
      const tokens = extractBrandishTokens(userText)
      if (isJunkResolvedHost(seed.url) || brandHostScore(seed.url, tokens) === 0) continue
      const probe = await analyzePublicSite(seed.url)
      if (!probe.ok) continue
      const finalUrl = probe.url || seed.url
      if (isJunkResolvedHost(finalUrl) || brandHostScore(finalUrl, tokens) === 0) continue
      return {
        url: finalUrl,
        source: 'brand_resolve',
        label: seed.title ?? probe.title ?? tokens[0] ?? null,
        note: lastNote
          ? `${lastNote} — using reachable ${finalUrl}`
          : `Resolved brand/name to ${finalUrl}`,
      }
    }
    return {
      url: null,
      source: 'none',
      label: lastLabel,
      note: lastNote ?? 'Could not resolve a reachable official URL from the brand/name',
    }
  }

  const existing = options.existingUrl ? extractHttpUrl(options.existingUrl) : null
  if (existing && !options.preferMessageOverExisting) {
    const hadProtocol = /https?:\/\//i.test(options.existingUrl ?? '')
    return {
      url: existing,
      source: hadProtocol ? 'explicit_url' : 'bare_domain',
      label: null,
      note: null,
    }
  }

  if (keys.length === 0 || !shouldTryBrandResolve(userText)) {
    return { url: null, source: 'none', label: null, note: null }
  }

  let lastNote: string | null = null
  let lastLabel: string | null = null
  for (const apiKey of keys) {
    const resolved = await withTimeout(
      resolveBrandWithGemini(userText, apiKey, options.preferredLanguage),
      BRAND_RESOLVE_TIMEOUT_MS,
      {
        url: null,
        label: null,
        note: 'Brand resolve timed out — continuing without a resolved URL',
      },
    )
    if (resolved.url) {
      return {
        url: resolved.url,
        source: 'brand_resolve',
        label: resolved.label,
        note: resolved.note,
      }
    }
    lastNote = resolved.note
    lastLabel = resolved.label
  }

  return {
    url: null,
    source: 'none',
    label: lastLabel,
    note: lastNote,
  }
}

export async function resolveAndAnalyzeSite(
  userText: string,
  options: { apiKey?: string | null; existingUrl?: string | null; existingSnapshot?: string | null } = {},
): Promise<{
  target: ResolvedSiteTarget
  analysis: SiteAnalysisResult | null
}> {
  if (options.existingSnapshot) {
    return {
      target: {
        url: options.existingUrl ?? extractHttpUrl(userText),
        source: 'explicit_url',
        label: null,
        note: null,
      },
      analysis: null,
    }
  }

  const target = await resolveSiteTarget(userText, options)
  if (!target.url) {
    return { target, analysis: null }
  }

  const analysis = await analyzePublicSite(target.url)
  return { target, analysis }
}
