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
  return (
    label.match(/"([^"]+)"/)?.[1] ??
    label.match(/«\s*([^»]+)\s*»/)?.[1] ??
    label.match(/'\s*([^']+)\s*'/)?.[1] ??
    label.match(/“\s*([^”]+)\s*”/)?.[1] ??
    null
  )
}

/** Locale code targeted by a search/open step, if any. */
function localeNoiseTarget(step: {
  label: string
  action: string
  targetHint?: string
}): string | null {
  const candidates = [
    extractQuoted(step.label),
    step.targetHint,
    // Quoted only — avoids matching “Ouvrir la page…”.
    step.label.match(
      /\b(?:recherch(?:er)?|search(?:\s+for)?|ouvrir|open)\s+[«"'“”]\s*([a-z]{2}(?:-[a-z]{2})?)\s*[»"'“”]/i,
    )?.[1],
    // Unquoted search whose entire query is a locale code.
    step.label.match(
      /\b(?:recherch(?:er)?|search(?:\s+for)?)\s+([a-z]{2}(?:-[a-z]{2})?)\s*$/i,
    )?.[1],
  ]
  for (const raw of candidates) {
    if (!raw) continue
    const t = raw.trim()
    if (isLocalePathSegment(t)) return t
  }
  return null
}

/**
 * Drop hallucinated “search/open fr” steps derived from a `/fr/` URL prefix.
 */
export function stripLocaleSearchNoiseSteps<
  T extends { label: string; action: string; targetHint?: string },
>(steps: T[]): T[] {
  return steps.filter((step) => {
    const locale = localeNoiseTarget(step)
    if (!locale) return true
    const blob = `${step.action} ${step.label}`.toLowerCase()
    // Type/Click/Search whose only target is a locale code — superfluous.
    return !/(type|search|click|recherch|ouvrir|open|sais|taper)/i.test(blob)
  })
}

function foldForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Targets the user explicitly rejected in natural language
 * (« pas besoin de cliquer sur Connexion », « enlève Login », « without clicking Sign in »).
 */
export function extractRejectedActionTargets(userMessage: string): string[] {
  const text = userMessage.trim()
  if (!text) return []
  const out: string[] = []
  const patterns = [
    /pas\s+besoin\s+(?:de\s+)?(?:cliquer\s+(?:sur\s+)?|sur\s+)?[«"'“”]?\s*([^»"'“”.,;:!?\n]+)/gi,
    /(?:n['’]y\s+a\s+pas\s+besoin|inutile)\s+(?:de\s+)?(?:cliquer\s+(?:sur\s+)?|sur\s+)?[«"'“”]?\s*([^»"'“”.,;:!?\n]+)/gi,
    /(?:enl[eè]ve|supprime|retire|retire[rz]?|sans)\s+(?:le\s+|la\s+|l['’]\s*)?(?:clic(?:quer)?(?:\s+sur)?|étape)?\s*[«"'“”]?\s*([^»"'“”.,;:!?\n]+)/gi,
    /(?:don'?t|do\s+not|no\s+need\s+to)\s+click(?:\s+on)?\s+[«"'“”]?\s*([^»"'“”.,;:!?\n]+)/gi,
    /without\s+clicking(?:\s+on)?\s+[«"'“”]?\s*([^»"'“”.,;:!?\n]+)/gi,
    /skip(?:ping)?\s+(?:the\s+)?[«"'“”]?\s*([^»"'“”.,;:!?\n]+)\s+(?:click|step)/gi,
  ]
  for (const re of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      let raw = (m[1] ?? '').trim()
      // Cut trailing "uniquement…" / "only…" clauses from the same sentence fragment.
      raw = raw
        .replace(/\s*,?\s*(?:uniquement|seulement|juste|only|just)\b[\s\S]*$/i, '')
        .replace(/\s+pour\s+[\s\S]*$/i, '')
        .replace(/[»"'“”]+$/g, '')
        .trim()
      if (raw.length < 2 || raw.length > 48) continue
      const folded = foldForMatch(raw)
      if (!folded || folded.length < 2) continue
      if (!out.includes(folded)) out.push(folded)
    }
  }
  return out
}

/**
 * Product rule — honor explicit step removals.
 * If the user rejects a control (“pas de Connexion”), drop matching Click steps
 * even when the model claims a fix but keeps them in `plan.steps`.
 */
export function stripUserRejectedActionSteps<
  T extends { label: string; action: string; targetHint?: string },
>(steps: T[], userMessage: string | null | undefined): T[] {
  if (!userMessage?.trim() || steps.length === 0) return steps
  const rejected = extractRejectedActionTargets(userMessage)
  if (rejected.length === 0) return steps

  return steps.filter((step) => {
    const blob = foldForMatch(`${step.action} ${step.label} ${step.targetHint ?? ''}`)
    const quoted = extractQuoted(step.label)
    const hint = step.targetHint
    const hit = rejected.some((r) => {
      if (quoted && foldForMatch(quoted).includes(r)) return true
      if (hint && foldForMatch(hint).includes(r)) return true
      return blob.includes(r)
    })
    if (!hit) return true
    // Only drop interactive steps that target the rejected control — keep Verify/Navigate noise-free.
    return !/(click|cliquer|clique|select|choisis|type|sais|taper|search|recherch)/i.test(
      `${step.action} ${step.label}`,
    )
  })
}

/**
 * Fill-only pivot: drop download / submit Clicks and their success Verifies
 * so grounding cannot re-derive a contradicted outcome from leftover steps.
 */
export function stripFillOnlyContradictedSteps<
  T extends { label: string; action: string; targetHint?: string },
>(steps: T[], fillOnly: boolean): T[] {
  if (!fillOnly || steps.length === 0) return steps
  return steps.filter((step) => {
    const blob = `${step.action} ${step.label} ${step.targetHint ?? ''}`
    const isInteractive =
      /(click|cliquer|clique|select|choisis|soumett|submit|envoy)/i.test(blob)
    const isVerify = /(verify|v[eé]rif|check|wait)/i.test(blob)
    const isDownloadOrSubmit =
      /t[eé]l[eé]charg|download|soumett|submit|envoyer|je\s+valide|send\s+(the\s+)?form|livre\s*blanc|white\s*paper/i.test(
        blob,
      )
    if (isInteractive && isDownloadOrSubmit) return false
    if (
      isVerify &&
      /t[eé]l[eé]charg|download|confirmation\s+d['’]?envoi|form\s+submission|brochure\s+download|succ[eè]s\s+du\s+t[eé]l[eé]charg/i.test(
        blob,
      )
    ) {
      return false
    }
    return true
  })
}
