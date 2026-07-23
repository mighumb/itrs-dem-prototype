import { GoogleGenerativeAI } from '@google/generative-ai'
import { analyzePublicSite, extractHttpUrl, type SiteAnalysisResult } from './analyzeSite.js'

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

function shouldTryBrandResolve(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 3) return false
  // Pure greetings / ultra-short asks — don't burn a search call
  if (
    /^(hi|hello|hey|bonjour|salut|aide|help|coucou)([.!?]|$)/i.test(t) &&
    t.split(/\s+/).length <= 2
  ) {
    return false
  }
  return true
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
): Promise<{ url: string | null; label: string | null; note: string | null }> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const modelCandidates = [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)

  let lastError: unknown
  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ googleSearchRetrieval: {} }],
        systemInstruction: `You resolve a brand, company, product, or website name to its official consumer homepage URL.
Rules:
- Prefer the official brand website (not social networks, app stores, Wikipedia, news, or booking aggregators unless that IS the product).
- Reply with ONLY one line: either a single https URL, or the word NONE.
- No markdown, no commentary.`,
      })

      const result = await model.generateContent(
        `Official homepage URL for this site/brand (monitoring target): ${query}`,
      )
      const text = result.response.text().trim()
      const fromText = firstUrlFromText(text)
      const grounded = urlsFromGrounding(result.response)

      const candidates = [
        ...(fromText ? [{ url: fromText, title: null as string | null }] : []),
        ...grounded,
      ]

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
  options: { apiKey?: string | null; existingUrl?: string | null } = {},
): Promise<ResolvedSiteTarget> {
  const explicit =
    (options.existingUrl && extractHttpUrl(options.existingUrl)) || extractHttpUrl(userText)

  if (explicit) {
    const hadProtocol = /https?:\/\//i.test(userText) || /https?:\/\//i.test(options.existingUrl ?? '')
    return {
      url: explicit,
      source: hadProtocol ? 'explicit_url' : 'bare_domain',
      label: null,
      note: hadProtocol ? null : `Normalized domain to ${explicit}`,
    }
  }

  if (!options.apiKey || !shouldTryBrandResolve(userText)) {
    return { url: null, source: 'none', label: null, note: null }
  }

  const resolved = await resolveBrandWithGemini(userText, options.apiKey)
  if (!resolved.url) {
    return {
      url: null,
      source: 'none',
      label: resolved.label,
      note: resolved.note,
    }
  }

  return {
    url: resolved.url,
    source: 'brand_resolve',
    label: resolved.label,
    note: resolved.note,
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
