import { GoogleGenerativeAI } from '@google/generative-ai'
import { geminiModelCandidates } from './geminiModels.js'
import { analyzePublicSite, extractHttpUrl, type SiteAnalysisResult } from './analyzeSite.js'
import { looksLikeSocialChat } from './discoverySiteIntent.js'

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

/** Product / intent vocabulary — never treat these leftovers as a brand to Search. */
const INTENT_STOPWORD_RE =
  /\b(je|j|tu|il|on|nous|vous|ils|me|moi|mon|ma|mes|ton|ta|tes|son|sa|ses|veux|voudrais|aimerais|aimerai|souhaite|souhaiterais|besoin|faire|fais|fait|faisons|faites|font|créer|cree|creer|crée|crées|créons|créez|créent|créé|créée|construire|construis|construit|construisons|construisez|construisent|créons|build|building|builds|built|create|creating|creates|created|make|making|makes|made|start|starting|starts|started|commencer|commence|commençons|lance(?:r|z)?|lançons|préparer|prépare|préparons|setup|set\s*up|let'?s|lets|surveiller|monitor(?:er|ing)?|parcours|journey|journeys|flow|flows|scenario|scénario|tunnel|checkout|cart|panier|site|website|web|app|application|pour|avec|de|du|des|le|la|les|un|une|the|a|an|to|for|of|on|in|dans|please|svp|merci|aide[- ]?moi|help\s+me|i\s+want|i'd\s+like|i\s+would\s+like|can\s+you|could\s+you|quel(?:le)?s?|what|which|how|comment|aujourd['’]?hui|today)\b/gi

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

function extractBrandishTokens(text: string): string[] {
  const leftover = text
    .replace(INTENT_STOPWORD_RE, ' ')
    .replace(/[^\p{L}\p{N}.-]+/gu, ' ')
    .trim()

  if (!leftover) return []
  return leftover
    .split(/\s+/)
    .map((w) => w.replace(/^['’]+|['’]+$/g, ''))
    // Acronyms like FFF / EDF are 3 letters; allow 2+ for short org codes.
    .filter((w) => {
      const compact = w.replace(/\./g, '')
      if (/^[A-Za-zÀ-ü]{2,6}$/u.test(compact)) return true
      return w.length >= 3
    })
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
  query: string,
  apiKey: string,
  preferredLanguage?: 'en' | 'fr' | null,
): Promise<{ url: string | null; label: string | null; note: string | null }> {
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
        .sort(
          (a, b) =>
            localeUrlScore(b.url, preferredLanguage) - localeUrlScore(a.url, preferredLanguage),
        )
        .slice(0, 3)

      for (const candidate of candidates) {
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

      if (fromText) {
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
        resolveBrandWithGemini(brandTokens.join(' '), apiKey, options.preferredLanguage),
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
      resolveBrandWithGemini(brandTokens.join(' '), apiKey, options.preferredLanguage),
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
