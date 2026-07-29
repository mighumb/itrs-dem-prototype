/**
 * Shared URL path helpers for Discovery grounding + runner.
 * Keep free of Playwright / Node-only APIs (imported by the Vite client too).
 */

/** `fr`, `en`, `en-US`, `pt-BR` — market/locale path prefixes, not content slugs. */
export function isLocalePathSegment(segment: string): boolean {
  const s = segment.trim()
  if (!s || s.length > 5) return false
  return /^[a-z]{2}(?:-[a-z]{2})?$/i.test(s)
}

/**
 * Path beyond `/`, query, or hash → deep link (destination, not entry).
 * Locale-only paths (`/fr/`, `/en-US/`) are market homes, not deep content.
 */
export function isDeepUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length === 0 && !u.search && !u.hash) return false
    if (
      parts.length === 1 &&
      isLocalePathSegment(parts[0]!) &&
      !u.search &&
      !u.hash
    ) {
      return false
    }
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return path !== '/' || Boolean(u.search) || Boolean(u.hash)
  } catch {
    return false
  }
}

/** Prefer locale homepage (`/fr/`) when the destination path starts with a locale. */
export function homepageOf(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] && isLocalePathSegment(parts[0])) {
      return `${u.origin}/${parts[0].toLowerCase()}/`
    }
    return `${u.origin}/`
  } catch {
    return url
  }
}

/**
 * Derive a human search query from a deep URL path slug.
 * Never returns a bare locale code (`fr`, `en`, …).
 */
export function queryFromDeepUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length === 0) return null
    const content =
      parts[0] && isLocalePathSegment(parts[0]) ? parts.slice(1) : parts
    if (content.length === 0) return null

    const skip = new Set([
      'wiki',
      'w',
      'product',
      'products',
      'p',
      'dp',
      'item',
      'articles',
      'article',
    ])
    let slug = content[content.length - 1] || ''
    if (content.length >= 2 && skip.has(content[0]!.toLowerCase())) {
      slug = content[content.length - 1] || slug
    }
    if (isLocalePathSegment(slug)) return null

    const decoded = decodeURIComponent(slug)
      .replace(/[_+]+/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    return decoded.length >= 2 ? decoded : null
  } catch {
    return null
  }
}

function extractQuoted(label: string): string | null {
  return label.match(/"([^"]+)"/)?.[1] ?? label.match(/«\s*([^»]+)\s*»/)?.[1] ?? null
}

/**
 * Drop hallucinated “search/open fr” steps derived from a `/fr/` URL prefix.
 */
export function stripLocaleSearchNoiseSteps<
  T extends { label: string; action: string; targetHint?: string },
>(steps: T[]): T[] {
  return steps.filter((step) => {
    const quoted = (extractQuoted(step.label) || step.targetHint || '').trim()
    if (!quoted || !isLocalePathSegment(quoted)) return true
    const blob = `${step.action} ${step.label}`.toLowerCase()
    // Type/Click/Search whose only target is a locale code — superfluous.
    return !/(type|search|click|recherch|ouvrir|open|sais|taper)/i.test(blob)
  })
}
