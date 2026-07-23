/**
 * Lightweight public-page inspection for Discovery.
 * Returns a compact text snapshot the LLM can treat as real evidence.
 */

export type SiteAnalysisResult = {
  ok: boolean
  url: string
  reason: string | null
  snapshot: string | null
  title: string | null
  status: number | null
}

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_CHARS = 180_000
const MAX_SNAPSHOT_CHARS = 6_000

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      'i',
    )
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
      'i',
    )
    const match = html.match(re) ?? html.match(alt)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function extractLinks(html: string, limit = 20): string[] {
  const links: string[] = []
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) && links.length < limit) {
    const href = match[1].trim()
    const label = stripTags(match[2]).slice(0, 60)
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue
    const line = label ? `${label} → ${href}` : href
    if (!links.includes(line)) links.push(line)
  }
  return links
}

function buildSnapshot(url: string, status: number, html: string): { title: string | null; snapshot: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 160) : null
  const description =
    pickMeta(html, ['description', 'og:description', 'twitter:description']) ?? null
  const ogType = pickMeta(html, ['og:type'])
  const links = extractLinks(html)
  const bodyText = stripTags(html).slice(0, 1800)

  const parts = [
    `URL: ${url}`,
    `HTTP status: ${status}`,
    title ? `Title: ${title}` : null,
    description ? `Meta description: ${description}` : null,
    ogType ? `og:type: ${ogType}` : null,
    links.length > 0 ? `Notable links:\n- ${links.join('\n- ')}` : 'Notable links: (none extracted)',
    bodyText ? `Visible text sample: ${bodyText}` : null,
  ].filter(Boolean)

  return {
    title,
    snapshot: parts.join('\n').slice(0, MAX_SNAPSHOT_CHARS),
  }
}

export function extractHttpUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  if (!match) return null
  return match[0].replace(/[.,);]+$/g, '')
}

export async function analyzePublicSite(rawUrl: string): Promise<SiteAnalysisResult> {
  let url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      ok: false,
      url,
      reason: 'Invalid URL',
      snapshot: null,
      title: null,
      status: null,
    }
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      ok: false,
      url,
      reason: 'Only http/https URLs are supported',
      snapshot: null,
      title: null,
      status: null,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'ITRS-DEM-DiscoveryBot/1.0 (+https://itrs-dem-prototype.vercel.app; public monitoring analysis)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    })

    const status = response.status
    const contentType = response.headers.get('content-type') ?? ''

    if (status === 401 || status === 403) {
      return {
        ok: false,
        url: response.url || parsed.toString(),
        reason: `Access blocked (HTTP ${status}) — possible login-wall or bot protection`,
        snapshot: null,
        title: null,
        status,
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        url: response.url || parsed.toString(),
        reason: `Site responded with HTTP ${status}`,
        snapshot: null,
        title: null,
        status,
      }
    }

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType) && contentType) {
      return {
        ok: false,
        url: response.url || parsed.toString(),
        reason: `Unsupported content-type (${contentType})`,
        snapshot: null,
        title: null,
        status,
      }
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS)
    const lower = html.toLowerCase()
    const loginSignals =
      /(<input[^>]+type=["']password["']|sign\s*in|log\s*in|connexion|se connecter|auth0|okta)/i.test(
        lower,
      ) && !/<nav|<header|<main/i.test(html.slice(0, 5000))

    const { title, snapshot } = buildSnapshot(response.url || parsed.toString(), status, html)

    if (loginSignals && stripTags(html).length < 200) {
      return {
        ok: false,
        url: response.url || parsed.toString(),
        reason: 'Login-wall suspected — little public content available',
        snapshot,
        title,
        status,
      }
    }

    return {
      ok: true,
      url: response.url || parsed.toString(),
      reason: null,
      snapshot,
      title,
      status,
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      url: parsed.toString(),
      reason: aborted ? `Timed out after ${FETCH_TIMEOUT_MS}ms` : 'Network error while fetching the site',
      snapshot: null,
      title: null,
      status: null,
    }
  } finally {
    clearTimeout(timer)
  }
}
