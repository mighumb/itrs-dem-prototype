import { GoogleGenerativeAI } from '@google/generative-ai'
import { geminiModelCandidates } from './geminiModels.js'
import { analyzePublicSite, extractHttpUrl, type SiteAnalysisResult } from './analyzeSite.js'
import {
  extractBrandishTokens,
  looksLikeSocialChat,
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

const BRAND_RESOLVE_TIMEOUT_MS = 12_000

function shouldTryBrandResolve(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 2) return false
  // Ultra-short social / ping — never burn a brand Search call
  if (looksLikeSocialChat(t)) return false
  // Pure greetings / ultra-short asks — don't burn a search call
  if (
    /^(hi|hello|hey|bonjour|salut|aide|help|coucou|test|ok)([.!?]|$)/i.test(t) &&
    t.split(/\s+/).length <= 2
  ) {
    return false
  }

  // Only resolve when something brandish remains after stripping product intent
  // vocabulary ("parcours" / "Construisons" must never become a Search query).
  return extractBrandishTokens(t).length > 0
}

/** Prefer hosts that literally contain a user-named brand token. */
function brandHostScore(url: string, brandTokens: string[]): number {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    let score = 0
    for (const token of brandTokens) {
      const compact = token.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (compact.length >= 3 && host.includes(compact)) score += 100
    }
    return score
  } catch {
    return 0
  }
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
    const host = new URL(url).hostname.toLowerCase()
    if (preferredLanguage === 'fr') {
      if (host.endsWith('.fr')) return 100
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
    // Skip obvious non-homepages from search index noise when possible later
    out.push({ url: uri, title: chunk.web?.title ?? null })
  }
  return out
}

async function resolveBrandWithGemini(
  brandTokens: string[],
  apiKey: string,
  preferredLanguage?: 'en' | 'fr' | null,
): Promise<{ url: string | null; label: string | null; note: string | null }> {
  const query = brandTokens.join(' ')
  const genAI = new GoogleGenerativeAI(apiKey)
  const modelCandidates = geminiModelCandidates('free')

  const localeHint =
    preferredLanguage === 'fr'
      ? 'User language/market is French — strongly prefer the official .fr (or local FR/BE/CH) consumer site over .us / .com global/US sites when both exist (e.g. clubmed.fr not clubmed.us).'
      : preferredLanguage === 'en'
        ? 'User language is English — prefer the primary consumer site for that brand in English-speaking markets when ambiguous.'
        : 'Prefer the primary official consumer homepage for the brand.'

  let lastError: unknown
  for (const modelName of modelCandidates) {
    try {
      // Gemini 2.x requires googleSearch (not deprecated googleSearchRetrieval).
      // Cast: @google/generative-ai typings may still only list the old tool.
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ googleSearch: {} }] as never,
        systemInstruction: `You resolve a brand, company, product, organization, or website name (including acronyms / abbreviations) to its official consumer homepage URL.
Rules:
- Prefer the official brand/org website (not social networks, app stores, Wikipedia, news, or booking aggregators unless that IS the product).
- Acronyms and abbreviations count: expand to the most likely official organization in the user's market, then that org's official homepage (use Search grounding). Prefer the local TLD when preferredLanguage/market implies it.
- If the query names a specific brand, return THAT brand's official site — never a sibling, parent-group, or "related" property the user did not name.
- ${localeHint}
- Reply with ONLY one line: either a single https URL, or the word NONE.
- No markdown, no commentary.`,
      })

      const result = await model.generateContent(
        `Official homepage URL for this site/brand/org/acronym (monitoring target): ${query}`,
      )
      const text = result.response.text().trim()
      const fromText = firstUrlFromText(text)
      const grounded = urlsFromGrounding(result.response)

      const candidates = [
        ...(fromText ? [{ url: fromText, title: null as string | null }] : []),
        ...grounded,
      ]
        .map((c) => ({
          ...c,
          brand: brandHostScore(c.url, brandTokens),
          locale: localeUrlScore(c.url, preferredLanguage),
        }))
        .sort((a, b) => b.brand - a.brand || b.locale - a.locale)
        .slice(0, 6)

      // Prefer candidates whose host contains the named brand; do not fall through
      // to a reachable alternate host just because it answered first.
      const brandMatched = candidates.filter((c) => c.brand > 0)
      const tryList = brandMatched.length > 0 ? brandMatched : candidates

      for (const candidate of tryList) {
        // Quick reachability check — prefer a URL that actually responds
        const probe = await analyzePublicSite(candidate.url)
        if (probe.ok) {
          return {
            url: probe.url,
            label: candidate.title ?? probe.title,
            note: `Resolved brand/name to ${probe.url}`,
          }
        }
      }

      // Incomplete probe is OK only when the host still contains the named brand.
      // Never fall back to an alternate host that does not match the brand tokens.
      if (fromText && brandHostScore(fromText, brandTokens) > 0) {
        return {
          url: fromText,
          label: null,
          note: `Resolved brand/name to ${fromText} (page probe incomplete)`,
        }
      }

      return {
        url: null,
        label: null,
        note: 'Could not resolve a confident official URL from the brand/name',
      }
    } catch (error) {
      lastError = error
      console.error(`[resolveSiteTarget] model ${modelName} failed`, error)
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'brand resolve failed'
  return { url: null, label: null, note: `Brand resolve unavailable (${message})` }
}

/**
 * Resolve whatever the user typed into an inspectable site URL when possible:
 * explicit URL → bare domain → brand/name via Gemini + Google Search grounding.
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

  const brandTokens = extractBrandishTokens(userText)
  const keys = [
    ...(options.apiKeys ?? []),
    ...(options.apiKey ? [options.apiKey] : []),
  ].filter((key, index, all) => Boolean(key) && all.indexOf(key) === index)

  // New brand/name in the message → resolve it; do not glue the previous site.
  if (
    brandTokens.length > 0 &&
    keys.length > 0 &&
    shouldTryBrandResolve(userText) &&
    (options.preferMessageOverExisting || !options.existingUrl)
  ) {
    let lastNote: string | null = null
    let lastLabel: string | null = null
    for (const apiKey of keys) {
      const resolved = await withTimeout(
        resolveBrandWithGemini(brandTokens, apiKey, options.preferredLanguage),
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

  if (keys.length === 0 || !shouldTryBrandResolve(userText) || brandTokens.length === 0) {
    return { url: null, source: 'none', label: null, note: null }
  }

  let lastNote: string | null = null
  let lastLabel: string | null = null
  for (const apiKey of keys) {
    const resolved = await withTimeout(
      resolveBrandWithGemini(brandTokens, apiKey, options.preferredLanguage),
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
