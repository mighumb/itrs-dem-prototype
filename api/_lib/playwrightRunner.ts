import type { Browser, BrowserContext, Frame, Locator, Page, Route } from 'playwright-core'
import { canonicalSiteUrlFromText } from './discoverySiteIntent.js'

export type RunnerLocale = 'en' | 'fr'

export type RunnableStep = {
  id: string
  label: string
  action: string
  /** CSS selector or URL (legacy). */
  target?: string
  /** Visible link/button text observed on the site. */
  targetHint?: string
  /** Absolute URL observed for this step (navigate or click-through). */
  href?: string
}

export type RunnerFrame = {
  url: string
  title: string
  screenshotDataUrl: string
}

export type RunnerEvent =
  | { type: 'status'; text: string }
  | { type: 'step_start'; index: number; id: string; label: string }
  | {
      type: 'step_frame'
      index: number
      id: string
      label: string
      url: string
      title: string
      screenshotDataUrl: string
    }
  | {
      type: 'step_done'
      index: number
      id: string
      durationMs: number
      url: string
      title: string
      screenshotDataUrl?: string
    }
  | {
      type: 'step_failed'
      index: number
      id: string
      label: string
      error: string
      durationMs: number
      url?: string
      title?: string
      screenshotDataUrl?: string
    }
  | { type: 'done'; ok: boolean }
  | { type: 'error'; error: string }

function extractUrl(text: string | undefined | null): string | null {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)
  if (match) return match[0].replace(/[.,);]+$/g, '')
  const bare = text.match(/\b((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>]*)?)/i)
  if (!bare?.[1]) return null
  return `https://${bare[1].replace(/[.,);]+$/g, '')}`
}

function isDeepUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length === 0 && !u.search && !u.hash) return false
    if (
      parts.length === 1 &&
      /^[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0]!) &&
      parts[0]!.length <= 5 &&
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

export { isDeepUrl }

function homepageOf(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0]) && parts[0].length <= 5) {
      return `${u.origin}/${parts[0].toLowerCase()}/`
    }
    return `${u.origin}/`
  } catch {
    return url
  }
}

/** Prefer homepage as seed — deep links are destinations, not entry points. */
function guessSeedUrl(
  steps: RunnableStep[],
  prompt?: string,
  siteUrl?: string | null,
): string | null {
  if (siteUrl) {
    const cleaned = extractUrl(siteUrl) || siteUrl
    if (cleaned) return isDeepUrl(cleaned) ? homepageOf(cleaned) : cleaned
  }
  for (const step of steps) {
    const raw =
      extractUrl(step.href) || extractUrl(step.target) || extractUrl(step.label)
    if (raw) return isDeepUrl(raw) ? homepageOf(raw) : raw
  }
  const fromPrompt = extractUrl(prompt ?? null)
  if (fromPrompt) return isDeepUrl(fromPrompt) ? homepageOf(fromPrompt) : fromPrompt
  const blob = [prompt, ...steps.map((s) => s.label)].filter(Boolean).join(' ')
  const canonical = canonicalSiteUrlFromText(blob, runnerLocaleFromSteps(steps, prompt))
  if (canonical) return canonical
  return null
}

function runnerLocaleFromSteps(steps: RunnableStep[], prompt?: string): 'en' | 'fr' {
  const blob = `${prompt ?? ''} ${steps.map((s) => s.label).join(' ')}`
  return /[àâäéèêëïîôùûüç]|wikipédia|français/i.test(blob) ? 'fr' : 'en'
}

/**
 * User-chosen destination URL (deep path). This is the contract for the run —
 * geo redirects must not silently replace it.
 */
export function guessDestinationUrl(
  steps: RunnableStep[],
  prompt?: string,
  siteUrl?: string | null,
): string | null {
  const fromSite = siteUrl ? extractUrl(siteUrl) || siteUrl : null
  if (fromSite && isDeepUrl(fromSite) && !isAuthGatewayPath(fromSite)) return fromSite

  const fromPrompt = extractUrl(prompt ?? null)
  if (fromPrompt && isDeepUrl(fromPrompt) && !isAuthGatewayPath(fromPrompt)) return fromPrompt

  // Prefer form-like deep hrefs observed on Click/Navigate steps.
  const deep: string[] = []
  for (const step of steps) {
    const raw =
      extractUrl(step.href) || extractUrl(step.target) || extractUrl(step.label)
    if (raw && isDeepUrl(raw)) deep.push(raw)
  }
  const formLike = deep.find((u) =>
    /\/(brochure|contact|demo|devis|lead|form|inscription|signup)/i.test(u),
  )
  // Auth/gateway paths must not become the run "hold destination" — after Click
  // « Connexion » / SSO the runner must stay on the post-gateway page, not snap back.
  const nonAuth = deep.find((u) => !isAuthGatewayPath(u))
  return formLike || nonAuth || null
}

/** Login / SSO / auth gateway URLs — deep but not a sticky destination contract. */
export function isAuthGatewayPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return /\/(login|log-?in|signin|sign-?in|connexion|auth|sso|oauth|account\/login|session)(\/|$)/i.test(
      path,
    )
  } catch {
    return /\/(login|signin|connexion|auth|sso)(\/|$)/i.test(url)
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** Path + search, trailing slash insensitive. Hash is handled separately. */
export function urlPathKey(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return `${path}${u.search}`
  } catch {
    return url
  }
}

export function urlHash(url: string): string {
  try {
    return new URL(url).hash
  } catch {
    return ''
  }
}

/** Same origin + path (+ search). When destination has a hash, fragment must match too. */
export function urlsMatchDestination(current: string, destination: string): boolean {
  try {
    const cur = new URL(current)
    const dest = new URL(destination)
    if (cur.origin !== dest.origin) return false
    if (urlPathKey(current) !== urlPathKey(destination)) return false
    const destHash = dest.hash
    if (!destHash) return true
    return cur.hash === destHash
  } catch {
    return false
  }
}

function resolveHrefAgainstPage(pageUrl: string, href: string): string {
  try {
    return new URL(href, pageUrl).href
  } catch {
    return href
  }
}

async function scrollToUrlHash(page: Page, url: string): Promise<void> {
  try {
    const hash = new URL(url).hash
    if (!hash || hash.length <= 1) return
    const id = decodeURIComponent(hash.slice(1))
    const target = page.locator(`#${cssEscape(id)}`).first()
    await target.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => undefined)
    await page.waitForTimeout(250)
  } catch {
    // best effort
  }
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Strip combining marks so "Zinedine" matches "Zinédine". */
export function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Case- and diacritic-insensitive RegExp for Playwright role/name matching.
 * Maps base Latin letters to common accented variants.
 */
export function diacriticInsensitiveRegExp(value: string, flags = 'i'): RegExp {
  // Fold first so "Zinédine" and "Zinedine" produce the same character classes.
  const sliced = foldDiacritics(value).trim().slice(0, 48)
  const escaped = sliced.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const variants: Record<string, string> = {
    a: 'aàáâãäåāăą',
    c: 'cçćč',
    e: 'eèéêëēĕėęě',
    i: 'iìíîïĩīĭį',
    n: 'nñńň',
    o: 'oòóôõöøōŏő',
    u: 'uùúûüũūŭůű',
    y: 'yýÿŷ',
    s: 'sśšş',
    z: 'zźżž',
  }
  const body = [...escaped]
    .map((ch) => {
      const lower = ch.toLowerCase()
      const set = variants[lower]
      if (!set) return ch
      const chars = ch === lower ? set : set.toUpperCase()
      return `[${chars}]`
    })
    .join('')
  return new RegExp(body, flags)
}

/** Heuristic: URL looks like a search-results page (any site). */
function pageLooksLikeSearchResults(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.searchParams.has('search') || u.searchParams.has('q') || u.searchParams.has('query')) {
      // Empty query on a search endpoint still counts as results chrome.
      return true
    }
    const path = u.pathname.toLowerCase()
    return /\/(search|recherche|find|results?)(\/|$)/i.test(path) || /special:search|sp[eé]cial:recherche/i.test(path)
  } catch {
    return /[?&](search|q|query)=|\/(search|recherche)\b/i.test(url)
  }
}

/** True when URL/title already matches the click target (e.g. article opened by typeahead). */
export function alreadyOnClickTargetPage(url: string, title: string, hint: string): boolean {
  const raw = hint.trim()
  if (raw.length < 3) return false
  const foldedHint = foldDiacritics(raw).toLowerCase().replace(/\s+/g, ' ')
  const foldedTitle = foldDiacritics(title || '').toLowerCase()
  let decodedUrl = url
  try {
    decodedUrl = decodeURIComponent(url)
  } catch {
    // keep raw
  }
  const foldedUrl = foldDiacritics(decodedUrl).toLowerCase()
  if (foldedTitle.includes(foldedHint)) return true
  const slugSpace = foldedHint.replace(/\s+/g, '_')
  const slugNone = foldedHint.replace(/\s+/g, '')
  if (foldedUrl.includes(slugSpace) || foldedUrl.includes(slugNone)) return true
  // First meaningful token (Zinedine / Mbappé) often enough for wiki titles
  const token = foldedHint.split(/\s+/).find((t) => t.length >= 4)
  if (token && (foldedTitle.includes(token) || foldedUrl.includes(token))) return true
  return false
}

/** Meaningful tokens for soft Verify (ignore tiny words). */
export function significantVerifyTokens(hint: string): string[] {
  return foldDiacritics(hint)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
    .filter((t) => !/^(dans|pour|avec|section|presence|présence|verify|check|page|this|that|sont|avec|comme)$/i.test(t))
}

async function searchInputValue(page: Page): Promise<string> {
  const loc = await findSearchLocator(page)
  if (!loc) return ''
  return (await loc.inputValue().catch(() => ''))?.trim() ?? ''
}

export type MarketCountry = 'FR' | 'US'

/**
 * Default market from UI locale, overridden when the destination path itself
 * signals an international / foreign segment (URL wins).
 */
export function marketCountryFor(
  locale: RunnerLocale,
  destinationUrl?: string | null,
): MarketCountry {
  if (destinationUrl) {
    try {
      const u = new URL(destinationUrl)
      const path = u.pathname.toLowerCase()
      if (
        /brochure-inter|international|\/en(\/|$)|\/us(\/|$)|\/uk(\/|$)|\/de(\/|$)|\/es(\/|$)/i.test(
          path,
        )
      ) {
        return 'US'
      }
      if (
        /\/fr(\/|$)/i.test(path) ||
        /brochure(?!-inter)/i.test(path) ||
        /\.fr$/i.test(u.hostname)
      ) {
        return 'FR'
      }
    } catch {
      // fall through
    }
  }
  return locale === 'fr' ? 'FR' : 'US'
}

async function applyMarketCookies(
  context: BrowserContext,
  pageUrl: string,
  country: MarketCountry,
): Promise<void> {
  try {
    const u = new URL(pageUrl)
    // CRITICAL: cookie path must be `/`. If we pass url=…/brochure, Playwright
    // scopes the cookie to that path and geo redirects (hetic __dplc) ignore it.
    const originUrl = `${u.origin}/`
    await context.addCookies([
      { name: '__dplc', value: country, url: originUrl },
      { name: 'country', value: country, url: originUrl },
      { name: 'countryCode', value: country, url: originUrl },
    ])
  } catch {
    // Best-effort market alignment.
  }
}

/** Spoof common IP-geo APIs so sites don't lock market from Vercel US egress. */
async function installGeoApiMocks(
  context: BrowserContext,
  country: MarketCountry,
): Promise<void> {
  const data = {
    ip: country === 'FR' ? '90.84.0.1' : '8.8.8.8',
    country,
    country_code: country,
    countryCode: country,
    country_name: country === 'FR' ? 'France' : 'United States',
  }
  const fulfill = async (route: Route) => {
    const req = route.request()
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      await route.continue()
      return
    }
    // HETIC (and many CMPs) call ipinfo via jQuery JSONP — raw JSON breaks the
    // callback and the site falls back to the international brochure URL.
    let callback: string | null = null
    try {
      callback = new URL(req.url()).searchParams.get('callback')
    } catch {
      callback = null
    }
    const json = JSON.stringify(data)
    if (callback && /^[a-zA-Z_$][\w.$]*$/.test(callback)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: `${callback}(${json});`,
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: json,
    })
  }
  await context.route(/ipinfo\.io/i, fulfill)
  await context.route(/ipapi\.co/i, fulfill)
  await context.route(/geojs\.io/i, fulfill)
  await context.route(/ipgeolocation\.io/i, fulfill)
  await context.route(/freegeoip\./i, fulfill)
}

/**
 * When the user chose a deep URL, rewrite same-origin geo/locale sibling
 * document navigations back to that URL (e.g. /brochure-inter → /brochure).
 * Cookie/IP mocks help, but edge rules (ASN / redirection.io) can still bounce.
 *
 * IMPORTANT: do NOT register a catch-all star-star route — continuing it bypasses
 * later/earlier geo API mocks (Playwright only lets one handler win).
 */
async function installDestinationUrlGuard(
  context: BrowserContext,
  destinationUrl: string | null,
): Promise<void> {
  if (!destinationUrl || !isDeepUrl(destinationUrl)) return
  let dest: URL
  try {
    dest = new URL(destinationUrl)
  } catch {
    return
  }
  const destKey = urlPathKey(destinationUrl)

  await context.route(
    (url) => {
      try {
        const href = typeof url === 'string' ? url : String(url)
        const u = new URL(href)
        if (u.origin !== dest.origin) return false
        if (urlPathKey(href) === destKey) return false
        return areGeoPathSiblings(u.pathname, dest.pathname)
      } catch {
        return false
      }
    },
    async (route) => {
      const req = route.request()
      const type = req.resourceType()
      if (type !== 'document' && type !== 'other' && !req.isNavigationRequest()) {
        await route.continue()
        return
      }
      await route.continue({ url: destinationUrl })
    },
  )
}

/** /brochure ↔ /brochure-inter, /fr/… ↔ /en/…, etc. */
export function areGeoPathSiblings(aPath: string, bPath: string): boolean {
  const norm = (p: string) => p.replace(/\/+$/, '').toLowerCase() || '/'
  const a = norm(aPath)
  const b = norm(bPath)
  if (a === b) return true
  const strip = (p: string) =>
    p
      .replace(/-inter(national)?$/i, '')
      .replace(/\/(en|fr|us|uk|de|es|it|pt|nl)(\/|$)/gi, '/')
      .replace(/\/+/g, '/')
      .replace(/\/+$/, '') || '/'
  if (strip(a) === strip(b) && strip(a) !== '/') return true
  // brochure ↔ brochure-inter
  if (/brochure/i.test(a) && /brochure/i.test(b)) return true
  return false
}

/**
 * If geo/cookie redirected away from the user-chosen deep URL, force it back.
 * Market cookies are aligned to whatever that destination needs.
 */
export async function enforceUserDestination(
  page: Page,
  destinationUrl: string | null,
  runnerLocale: RunnerLocale,
): Promise<boolean> {
  if (!destinationUrl || !isDeepUrl(destinationUrl)) return false
  const current = page.url()
  if (!current || current === 'about:blank') return false
  if (!sameOrigin(current, destinationUrl)) return false
  if (urlsMatchDestination(current, destinationUrl)) return false

  const country = marketCountryFor(runnerLocale, destinationUrl)
  await applyMarketCookies(page.context(), destinationUrl, country)
  await page.goto(destinationUrl, { waitUntil: 'domcontentloaded', timeout: 35000 })
  await page.waitForTimeout(500)
  await dismissNoise(page)
  await scrollToUrlHash(page, destinationUrl)
  // Client-side geo scripts can still bounce once — hold the contract.
  if (!urlsMatchDestination(page.url(), destinationUrl)) {
    await applyMarketCookies(page.context(), destinationUrl, country)
    await page.goto(destinationUrl, { waitUntil: 'domcontentloaded', timeout: 35000 })
    await page.waitForTimeout(400)
    await dismissNoise(page)
    await scrollToUrlHash(page, destinationUrl)
  }
  return urlsMatchDestination(page.url(), destinationUrl)
}

const HIGHLIGHT_ID = '__dem_action_highlight__'

async function paintHighlight(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const pad = 4
  const painted = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  }
  await page
    .evaluate(
      ({ id, b }) => {
        document.getElementById(id)?.remove()
        const el = document.createElement('div')
        el.id = id
        Object.assign(el.style, {
          position: 'fixed',
          left: `${b.x}px`,
          top: `${b.y}px`,
          width: `${b.width}px`,
          height: `${b.height}px`,
          border: '3px solid #0071e3',
          borderRadius: '4px',
          boxShadow: '0 0 0 3px rgba(0, 113, 227, 0.28)',
          background: 'rgba(0, 113, 227, 0.06)',
          pointerEvents: 'none',
          zIndex: '2147483647',
          boxSizing: 'border-box',
        })
        document.documentElement.appendChild(el)
      },
      { id: HIGHLIGHT_ID, b: painted },
    )
    .catch(() => undefined)
}

async function clearHighlight(page: Page): Promise<void> {
  await page
    .evaluate((id) => document.getElementById(id)?.remove(), HIGHLIGHT_ID)
    .catch(() => undefined)
}

async function highlightLocator(page: Page, locator: Locator): Promise<boolean> {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => undefined)
    const box = await locator.boundingBox()
    if (!box || box.width < 2 || box.height < 2) return false
    await paintHighlight(page, box)
    await page.waitForTimeout(160)
    return true
  } catch {
    return false
  }
}

async function captureFrame(page: Page): Promise<RunnerFrame> {
  const [title, screenshot] = await Promise.all([
    page.title().catch(() => ''),
    page.screenshot({ type: 'jpeg', quality: 55, fullPage: false }),
  ])
  return {
    url: page.url(),
    title: title || 'Untitled',
    screenshotDataUrl: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
  }
}

async function captureHighlighted(
  page: Page,
  locator: Locator | null,
): Promise<RunnerFrame> {
  if (locator) await highlightLocator(page, locator)
  try {
    return await captureFrame(page)
  } finally {
    await clearHighlight(page)
  }
}

const CONSENT_REFUSE_SELECTORS = [
  '.didomi-continue-without-agreeing',
  'button:has-text("Continuer sans accepter")',
  '[class*="continue-without-agreeing" i]',
  'button:has-text("Tout refuser")',
  'button:has-text("Refuser et fermer")',
  'button:has-text("Refuser et fermer")',
  'button:has-text("Tout Refuser")',
  '#didomi-notice-disagree-button',
  '#onetrust-reject-all-handler',
  'button:has-text("Reject all")',
  'button:has-text("Reject All")',
  'button:has-text("Deny all")',
  'button:has-text("Decline all")',
  '[aria-label*="Refuse" i]',
  '[aria-label*="Disagree" i]',
  '[aria-label*="Reject all" i]',
  // Narrow single-word refuse — avoid matching form CTAs.
  '#didomi-notice-disagree-button',
]

const CONSENT_ACCEPT_SELECTORS = [
  '#didomi-notice-agree-button',
  '#onetrust-accept-btn-handler',
  'button:has-text("Tout accepter")',
  'button:has-text("Accept all")',
  'button:has-text("Accept All")',
  'button:has-text("Accept & Close")',
  'button:has-text("Agree and close")',
  'button:has-text("I agree")',
  // Avoid bare "Accept" / "Accepter" / "OK" — they match form CTAs ("J'accepte", submit).
]

export function isConsentStep(step: { label: string; action?: string; targetHint?: string }): boolean {
  const blob = `${step.action ?? ''} ${step.label} ${step.targetHint ?? ''}`
  return /cookie|bandeau|consent|rgpd|gdpr|didomi|onetrust|sans accepter|tout accepter|tout refuser|accepte?r les cookies|accept cookies|reject all/i.test(
    blob,
  )
}

async function firstVisibleInRoot(
  root: Page | Frame,
  selectors: string[],
  timeoutMs = 350,
): Promise<Locator | null> {
  for (const sel of selectors) {
    try {
      const loc = root.locator(sel).first()
      if (await loc.isVisible({ timeout: timeoutMs })) return loc
    } catch {
      // try next
    }
  }
  return null
}

/** Prefer refuse / continue-without; fall back to accept. Searches main page + frames (Didomi). */
async function findConsentButton(
  page: Page,
  prefer: 'refuse' | 'accept' | 'auto' = 'auto',
  hint?: string | null,
): Promise<Locator | null> {
  const refuseFirst =
    prefer === 'refuse' ||
    (prefer === 'auto' &&
      (!hint || /sans accepter|refus|reject|deny|disagree|decline/i.test(hint)))

  const ordered = refuseFirst
    ? [...CONSENT_REFUSE_SELECTORS, ...CONSENT_ACCEPT_SELECTORS]
    : [...CONSENT_ACCEPT_SELECTORS, ...CONSENT_REFUSE_SELECTORS]

  if (hint && hint.trim().length > 2) {
    const escaped = hint.trim().slice(0, 48).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ordered.unshift(`button:has-text("${hint.trim().slice(0, 48).replace(/"/g, '')}")`)
    ordered.unshift(`#didomi-notice-disagree-button`)
    try {
      const byRole = page.getByRole('button', { name: new RegExp(escaped, 'i') }).first()
      if (await byRole.isVisible({ timeout: 500 })) return byRole
    } catch {
      // continue with selectors
    }
  }

  const roots: Array<Page | Frame> = [page, ...page.frames().filter((f) => f !== page.mainFrame())]
  for (const root of roots) {
    const loc = await firstVisibleInRoot(root, ordered, 280)
    if (loc) return loc
  }
  return null
}

async function consentBannerVisible(page: Page): Promise<boolean> {
  return Boolean(await findConsentButton(page, 'auto'))
}

/**
 * Dismiss cookie / CMP banners (Didomi, OneTrust, …). Retries briefly because
 * CMPs often inject after first paint. Prefer “continue without accepting”
 * when present so we match typical FR demo plans.
 */
export async function dismissNoise(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await page.waitForTimeout(450)
    // Prefer Didomi "continue without agreeing" (often a <span>, not a <button>).
    const continueWithout = page.locator('.didomi-continue-without-agreeing').first()
    if (await continueWithout.isVisible({ timeout: 280 }).catch(() => false)) {
      try {
        await continueWithout.click({ timeout: 1500 })
        await page.waitForTimeout(350)
        continue
      } catch {
        // fall through to generic consent search
      }
    }
    const loc = await findConsentButton(page, 'refuse')
    if (!loc) return
    try {
      // Never click the page's lead-form submit while dismissing cookies.
      const id = (await loc.getAttribute('id').catch(() => '')) || ''
      const text = ((await loc.textContent().catch(() => '')) || '').trim()
      if (/edit-actions-submit|webform-button--submit/i.test(id)) return
      if (/télécharge|download|brochure|envoyer|submit/i.test(text) && !/cookie|didomi|accepter les/i.test(text)) {
        return
      }
      await loc.click({ timeout: 1500 })
      await page.waitForTimeout(350)
    } catch {
      // try again
    }
  }
}

async function findSearchLocator(page: Page): Promise<Locator | null> {
  // Generic ARIA / accessible name — not site-specific CSS.
  const byRole = await tryVisibleLocator(page, () => page.getByRole('searchbox').first(), 900)
  if (byRole) return byRole

  const byPlaceholder = await tryVisibleLocator(
    page,
    () => page.getByPlaceholder(/recherch|search/i).first(),
    700,
  )
  if (byPlaceholder) return byPlaceholder

  const byLabel = await tryVisibleLocator(
    page,
    () => page.getByLabel(/recherch|search/i).first(),
    700,
  )
  if (byLabel) return byLabel

  const selectors = [
    'input[name="search"]',
    'input[type="search"]',
    'input[name="q"]',
    'input[name="query"]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="Recherch" i]',
    'input[aria-label*="Search" i]',
    'input[aria-label*="Recherch" i]',
  ]
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 600 })) return loc
    } catch {
      // try next
    }
  }
  return null
}

async function fillLikelySearch(page: Page, query: string): Promise<Locator> {
  const loc = await findSearchLocator(page)
  if (!loc) throw new Error(`Could not find a search field to type: ${query}`)
  await loc.click({ timeout: 1000 })
  await loc.fill(query, { timeout: 2000 })
  return loc
}

async function isSearchFieldLocator(loc: Locator): Promise<boolean> {
  return loc
    .evaluate((el) => {
      if (!(el instanceof HTMLInputElement)) return false
      const id = el.id || ''
      const name = el.name || ''
      const type = el.type || ''
      const role = el.getAttribute('role') || ''
      const placeholder = el.placeholder || ''
      return (
        role === 'searchbox' ||
        type === 'search' ||
        id === 'searchInput' ||
        name === 'search' ||
        name === 'q' ||
        name === 'query' ||
        /recherch|search/i.test(placeholder)
      )
    })
    .catch(() => false)
}

/** True when visible text matches the query ignoring case/diacritics. */
async function locatorTextMatchesFolded(loc: Locator, foldedNeedle: string): Promise<boolean> {
  const text = ((await loc.innerText().catch(() => '')) || (await loc.textContent().catch(() => '')) || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return false
  return foldDiacritics(text).toLowerCase().includes(foldedNeedle.toLowerCase())
}

/** After typing in a search box: wait for suggestions, click a match, else Enter. */
async function submitTypeaheadAfterFill(page: Page, query: string): Promise<void> {
  const needle = query.trim().slice(0, 60)
  const firstToken = needle.split(/\s+/)[0] ?? needle
  const tokenRe = diacriticInsensitiveRegExp(firstToken)
  const foldedToken = foldDiacritics(firstToken)
  await page.waitForTimeout(350)

  const suggestionStrategies: Array<() => Promise<boolean>> = [
    // ARIA combobox / autocomplete (Codex, MUI, many design systems).
    async () => {
      const option = page.getByRole('option', { name: tokenRe }).first()
      if (!(await option.isVisible({ timeout: 2000 }).catch(() => false))) return false
      await option.click({ timeout: 4000 })
      return true
    },
    async () => {
      const listbox = page.getByRole('listbox').first()
      if (!(await listbox.isVisible({ timeout: 1500 }).catch(() => false))) return false
      const item = listbox.getByRole('option', { name: tokenRe }).first()
      if (!(await item.isVisible({ timeout: 1500 }).catch(() => false))) return false
      await item.click({ timeout: 4000 })
      return true
    },
    // Visible menu rows — ARIA first, then common autocomplete class names.
    async () => {
      for (const sel of [
        '[role="option"]',
        '[role="listbox"] li',
        '[role="listbox"] [role="presentation"]',
        '.autocomplete-suggestion',
        '.search-suggestion',
        '.ui-menu-item',
        '.tt-suggestion',
      ]) {
        const items = page.locator(sel)
        const n = Math.min(await items.count().catch(() => 0), 10)
        for (let i = 0; i < n; i++) {
          const item = items.nth(i)
          if (!(await item.isVisible({ timeout: 400 }).catch(() => false))) continue
          if (!(await locatorTextMatchesFolded(item, foldedToken))) continue
          await item.click({ timeout: 4000 })
          return true
        }
      }
      return false
    },
    // First suggestion link in an open search menu.
    async () => {
      const links = page.locator(
        '[role="listbox"] a[href], [role="menu"] a[href], .search-suggest a[href], .autocomplete-suggestions a[href]',
      )
      const n = Math.min(await links.count().catch(() => 0), 10)
      for (let i = 0; i < n; i++) {
        const link = links.nth(i)
        if (!(await link.isVisible({ timeout: 400 }).catch(() => false))) continue
        if (!(await locatorTextMatchesFolded(link, foldedToken))) continue
        await link.click({ timeout: 4000 })
        return true
      }
      return false
    },
  ]

  for (const tryClick of suggestionStrategies) {
    try {
      if (await tryClick()) {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // try next strategy
    }
  }

  await page.keyboard.press('Enter')
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
}

async function submitSearchAfterType(
  page: Page,
  step: RunnableStep,
  loc: Locator,
  query: string,
): Promise<void> {
  const isSearchField = await isSearchFieldLocator(loc)
  const shouldSubmit =
    isSearchTypeStep(step) ||
    /^search$/i.test(step.action.trim()) ||
    /^(search|recherch)/i.test(step.label.trim()) ||
    isSearchField

  if (!shouldSubmit) return

  await submitTypeaheadAfterFill(page, query)
}

/** Prefer quoted payload in labels: "…", '…', « … », “ … ”. */
function extractQuotedText(text: string): string | null {
  const patterns = [
    /"([^"]+)"/,
    /'([^']+)'/,
    /«\s*([^»]+)\s*»/,
    /“([^”]+)”/,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    const value = m?.[1]?.trim()
    if (value) return value
  }
  return null
}

function looksLikeCssSelector(value: string): boolean {
  return /^(?:[#.\[a-z]|input|textarea|button|form)/i.test(value.trim()) && /[#.\[\]=>:]/.test(value)
}

/** Tag-only selectors from the extension recorder match the wrong element. */
export function isWeakRecordedSelector(selector: string | null | undefined): boolean {
  if (!selector) return true
  const s = selector.trim().toLowerCase()
  if (!s) return true
  if (/^(a|button|div|span|input|select|textarea|li|ul|p|h[1-6]|form|label|section|article|nav|main)$/.test(s)) {
    return true
  }
  return false
}

/** True when a hint names a form field rather than the value to type. */
function looksLikeFieldName(hint: string): boolean {
  const h = hint.trim()
  if (!h || h.length > 60) return false
  if (/@/.test(h) || /\d{5,}/.test(h)) return false
  return /^(nom(\s+de\s+famille)?|pr[eé]nom|name|first\s*names?|last\s*names?|e-?mails?|mails?|t[eé]l[eé]phones?|phones?|mobiles?|portables?|mots?\s*de\s*passe|passwords?|adresses?|villes?|pays|companies|soci[eé]t[eé]s?|entreprises?|codes?\s*postaux?|zip|postal|subject|objet|message|comments?)$/i.test(
    h,
  )
}

export function isSearchTypeStep(step: RunnableStep): boolean {
  if (/^search$/i.test(step.action.trim())) return true
  const blob = `${step.action} ${step.label}`
  if (/lancer\s+la\s+recherch|submit\s+(the\s+)?search/i.test(blob)) return false
  if (/^(search|recherch)/i.test(step.label.trim())) return true
  if (/\b(search\s+for|rechercher?\s+)/i.test(blob)) return true
  // FR plans often say “Saisir « X » dans le champ de recherche” — still a search Type.
  if (/\bchamp\s+(?:de\s+|d['’])?recherche\b/i.test(blob)) return true
  if (/\b(?:barre|zone)\s+de\s+recherche\b/i.test(blob)) return true
  if (/\bsearch\s+field\b/i.test(blob)) return true
  if (/\bsais(?:ir|ie)\s+["'«].+["'»].*\brecherche\b/i.test(blob)) return true
  return false
}

function isEmailFieldStep(step: RunnableStep): boolean {
  return /e-?mail|mail\b/i.test(`${step.label} ${step.targetHint ?? ''} ${step.target ?? ''}`)
}

function isPhoneFieldStep(step: RunnableStep): boolean {
  return /t[eé]l[eé]phone|phone|mobile|portable/i.test(
    `${step.label} ${step.targetHint ?? ''} ${step.target ?? ''}`,
  )
}

function isPasswordFieldStep(step: RunnableStep): boolean {
  return /mot\s*de\s*passe|password|passwd|\bpwd\b/i.test(
    `${step.label} ${step.targetHint ?? ''} ${step.target ?? ''}`,
  )
}

function isCredentialTypeStep(step: RunnableStep): boolean {
  return isEmailFieldStep(step) || isPasswordFieldStep(step)
}

/** Visible field names to try when resolving a Type target (not the typed value). */
function fieldHintsFromStep(step: RunnableStep): string[] {
  const hints: string[] = []
  const push = (v: string | null | undefined) => {
    const t = v?.trim()
    if (!t || t.length < 2 || t.length > 50) return
    if (looksLikeCssSelector(t) || /@/.test(t)) return
    if (!hints.some((h) => h.toLowerCase() === t.toLowerCase())) hints.push(t)
  }

  if (step.targetHint && looksLikeFieldName(step.targetHint)) push(step.targetHint)

  const label = step.label
  const dansChamp = label.match(
    /\b(?:dans|into|in|sur)\s+(?:le\s+|la\s+|l['’])?(?:(?:champ|field)\s+(?:de\s+|d['’])?)?["«]?([^"»]+?)["»]?\s*$/i,
  )
  if (dansChamp?.[1]) push(dansChamp[1])

  const fieldPatterns: Array<{ re: RegExp; names: string[] }> = [
    {
      re: /champ\s+(?:de\s+|d['’])?recherche|barre\s+de\s+recherche|search\s+field|search\s+box/i,
      names: ['Rechercher', 'Search', 'search'],
    },
    {
      re: /pr[eé]nom|first\s*name|given/i,
      names: ['Prénom', 'Prenom', 'First name', 'firstname', 'first_name', 'galileo_first_name', 'given-name'],
    },
    {
      re: /nom\s+de\s+famille|last\s*name|surname/i,
      names: ['Nom de famille', 'Nom', 'Last name', 'lastname', 'last_name', 'surname', 'family-name'],
    },
    { re: /\bnom\b/i, names: ['Nom', 'Name', 'lastname', 'last_name', 'galileo_last_name', 'family-name'] },
    {
      re: /e-?mail|mail\b/i,
      names: ['Email', 'E-mail', 'Mail', 'Adresse e-mail', 'email', 'galileo_email'],
    },
    {
      re: /t[eé]l[eé]phone|phone|mobile|portable/i,
      names: [
        'Téléphone',
        'Telephone',
        'Phone',
        'Mobile',
        'Tel',
        'téléphone',
        'galileo_phone',
        'tel',
      ],
    },
    {
      re: /mot\s*de\s*passe|password|passwd|\bpwd\b/i,
      names: [
        'Mot de passe',
        'Password',
        'password',
        'passwd',
        'pwd',
        'current-password',
      ],
    },
    { re: /ville|city/i, names: ['Ville', 'City'] },
    { re: /soci[eé]t[eé]|entreprise|company/i, names: ['Société', 'Entreprise', 'Company'] },
  ]
  for (const { re, names } of fieldPatterns) {
    if (re.test(label) || (step.targetHint && re.test(step.targetHint))) {
      for (const n of names) push(n)
    }
  }

  return hints
}

/**
 * Value to type into a field. Order:
 * 1) quoted text in the label (e.g. Taper 'Kylian Mbappé' …)
 * 2) targetHint when it is the value (not a field name / CSS selector)
 * 3) instructional prefix patterns (Type / Taper / Search / …)
 * 4) full label (last resort)
 */
export function searchQueryFromStep(step: RunnableStep): string {
  const label = step.label

  const quoted = extractQuotedText(label)
  if (quoted) return quoted

  if (step.targetHint) {
    const hint = step.targetHint.trim()
    if (
      hint &&
      !looksLikeCssSelector(hint) &&
      !looksLikeFieldName(hint) &&
      hint.length < 120
    ) {
      return hint
    }
  }

  const patterns = [
    /search(?:\s+for)?\s+(.+)/i,
    /recherch(?:e|er)?\s+(.+)/i,
    /(?:type|taper|tape)\s+(.+)/i,
    /sais(?:ir|ie)\s+(.+)/i,
  ]
  for (const re of patterns) {
    const m = label.match(re)
    if (m?.[1]) {
      return m[1]
        .replace(/\s+and\b.*$/i, '')
        .replace(/\s+(?:dans|in|into|on)\b.*$/i, '')
        .replace(/^["'«“]+|["'»”]+$/g, '')
        .trim()
    }
  }
  return label
}

async function tryVisibleLocator(
  _page: Page,
  factory: () => Locator,
  timeoutMs = 700,
): Promise<Locator | null> {
  try {
    const loc = factory()
    if (await loc.isVisible({ timeout: timeoutMs })) return loc
  } catch {
    // ignore
  }
  return null
}

/**
 * Resolve the input/textarea for a Type step. Prefer the named form field
 * (Nom / Email / …) — never dump every value into the first text input.
 */
async function resolveTypeLocator(page: Page, step: RunnableStep): Promise<Locator | null> {
  if (step.target && !/^https?:\/\//i.test(step.target) && !isWeakRecordedSelector(step.target)) {
    const sel = step.target.split(',')[0]!.trim()
    const byTarget = await tryVisibleLocator(page, () => page.locator(sel).first(), 900)
    if (byTarget) return byTarget
  }

  for (const hint of fieldHintsFromStep(step)) {
    const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(escaped.slice(0, 40), 'i')

    const byLabel = await tryVisibleLocator(
      page,
      () => page.getByLabel(pattern).first(),
      800,
    )
    if (byLabel) return byLabel

    const byRole = await tryVisibleLocator(
      page,
      () => page.getByRole('textbox', { name: pattern }).first(),
      700,
    )
    if (byRole) return byRole

    const attrSelectors = [
      `input[placeholder*="${hint.replace(/"/g, '')}" i]`,
      `textarea[placeholder*="${hint.replace(/"/g, '')}" i]`,
      `input[name*="${hint.replace(/"/g, '').replace(/\s+/g, '')}" i]`,
      `input[name*="${hint.replace(/"/g, '').replace(/\s+/g, '_').toLowerCase()}" i]`,
      `input[aria-label*="${hint.replace(/"/g, '')}" i]`,
      `input[id*="${hint.replace(/"/g, '').replace(/\s+/g, '').toLowerCase()}" i]`,
    ]
    for (const sel of attrSelectors) {
      const loc = await tryVisibleLocator(page, () => page.locator(sel).first(), 500)
      if (loc) return loc
    }
  }

  if (isEmailFieldStep(step)) {
    const emailLoc = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            'input[type="email"], input[name*="mail" i], input[id*="mail" i], input[autocomplete="email"], input[placeholder*="mail" i]',
          )
          .first(),
      800,
    )
    if (emailLoc) return emailLoc
  }

  if (isPasswordFieldStep(step)) {
    const passwordLoc = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            [
              'input[type="password"]',
              'input[autocomplete="current-password"]',
              'input[autocomplete="new-password"]',
              'input[name*="pass" i]',
              'input[name*="pwd" i]',
              'input[id*="pass" i]',
              'input[id*="pwd" i]',
              'input[placeholder*="mot de passe" i]',
              'input[placeholder*="password" i]',
            ].join(', '),
          )
          .first(),
      800,
    )
    if (passwordLoc) return passwordLoc
  }

  // Drupal / CRM name fields (e.g. HETIC Galileo brochure).
  if (/\bnom\b/i.test(step.label) && !/pr[eé]nom/i.test(step.label)) {
    const lastName = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            'input[name*="last_name" i], input[autocomplete="family-name"], input[id*="last-name" i], input[placeholder="Nom"]',
          )
          .first(),
      700,
    )
    if (lastName) return lastName
  }
  if (/pr[eé]nom|first\s*name/i.test(step.label)) {
    const firstName = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            'input[name*="first_name" i], input[autocomplete="given-name"], input[id*="first-name" i], input[placeholder="Prénom"], input[placeholder="Prenom"]',
          )
          .first(),
      700,
    )
    if (firstName) return firstName
  }

  if (isPhoneFieldStep(step)) {
    const phoneLoc = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            [
              'input[type="tel"]',
              'input[type="galileo_phone_number"]',
              'input[name*="phone" i]',
              'input[name*="tel" i]',
              'input[name*="galileo_phone" i]',
              'input[id*="phone" i]',
              'input[id*="tel" i]',
              'input[autocomplete="tel"]',
              'input[placeholder*="éléphone" i]',
              'input[placeholder*="Telephone" i]',
            ].join(', '),
          )
          .first(),
      800,
    )
    if (phoneLoc) return phoneLoc
  }

  // Search box only for real search Type steps — never for brochure/lead forms.
  if (isSearchTypeStep(step)) {
    return (
      (await findSearchLocator(page)) ??
      (await tryVisibleLocator(page, () => page.locator('input[type="text"]').first(), 600))
    )
  }

  return null
}

async function fillField(locator: Locator, value: string): Promise<void> {
  await locator.click({ timeout: 2000 })
  await locator.fill(value, { timeout: 4000 })
}

/** Resolve a clickable locator without performing the click. */
async function resolveClickLocator(page: Page, step: RunnableStep): Promise<Locator | null> {
  const href = step.href || (step.target && /^https?:\/\//i.test(step.target) ? step.target : null)
  if (href) {
    try {
      const absoluteHref = href.startsWith('#')
        ? resolveHrefAgainstPage(page.url(), href)
        : href
      let pathOnly = ''
      let hashOnly = ''
      try {
        const parsed = new URL(absoluteHref)
        pathOnly = parsed.pathname
        hashOnly = parsed.hash
      } catch {
        pathOnly = ''
        hashOnly = ''
      }
      const selectors = [`a[href="${href}"]`, `a[href="${absoluteHref}"]`]
      if (pathOnly) selectors.push(`a[href="${pathOnly}"]`)
      if (hashOnly) {
        selectors.push(`a[href="${hashOnly}"]`)
        const id = decodeURIComponent(hashOnly.slice(1))
        selectors.push(`[id="${cssEscape(id)}"]`)
      }
      const byHref = page.locator(selectors.join(', ')).first()
      if (await byHref.isVisible({ timeout: 900 })) return byHref
    } catch {
      // fall through
    }
  }

  if (step.target && !/^https?:\/\//i.test(step.target) && !isWeakRecordedSelector(step.target)) {
    try {
      const loc = page.locator(step.target).first()
      if (await loc.isVisible({ timeout: 900 })) return loc
    } catch {
      // fall through
    }
  }

  const textHints = [
    step.targetHint,
    extractQuotedText(step.label),
    // Map instructional “submit search” phrases to real button labels.
    isSearchSubmitClickLabel(step.label) ? 'Rechercher' : null,
    isSearchSubmitClickLabel(step.label) ? 'Search' : null,
    step.label
      .replace(/^(click|select|choose|open|choisis|sélectionne|ouvre|clique|cliquer)\s+/i, '')
      .replace(/^(sur\s+)?(le\s+|la\s+|l['’]\s*)?(lien|bouton|onglet|menu|section)\s+/i, '')
      .replace(/^(sur\s+)/i, '')
      .split(/\s+and\b/i)[0]
      ?.trim(),
  ].filter((v): v is string => Boolean(v && v.length > 1 && v.length < 80))

  for (const hint of textHints) {
    const pattern = diacriticInsensitiveRegExp(hint.slice(0, 40))
    const folded = foldDiacritics(hint).slice(0, 40)

    // Prefer primary result links when still on a search-results page (any site).
    if (pageLooksLikeSearchResults(page.url())) {
      const resultLinks = page.locator(
        [
          'main a[href]',
          '[role="main"] a[href]',
          'article a[href]',
          '[role="list"] a[href]',
          '[role="listbox"] a[href]',
          'ol a[href]',
          '.search-result a[href]',
          '.search-results a[href]',
          '.results a[href]',
        ].join(', '),
      )
      const n = Math.min(await resultLinks.count().catch(() => 0), 20)
      for (let i = 0; i < n; i++) {
        const link = resultLinks.nth(i)
        if (!(await link.isVisible({ timeout: 500 }).catch(() => false))) continue
        if (!(await locatorTextMatchesFolded(link, folded))) continue
        return link
      }
    }

    // In-page section jumps: TOC / landmark nav / hash links.
    try {
      const toc = page.locator(
        'nav[aria-label*="contents" i] a[href^="#"], nav[aria-label*="sommaire" i] a[href^="#"], nav[aria-label*="table of contents" i] a[href^="#"], #toc a[href^="#"], .toc a[href^="#"], aside a[href^="#"]',
      )
      const tocCount = Math.min(await toc.count().catch(() => 0), 40)
      for (let i = 0; i < tocCount; i++) {
        const link = toc.nth(i)
        if (!(await link.isVisible({ timeout: 200 }).catch(() => false))) continue
        if (!(await locatorTextMatchesFolded(link, folded))) continue
        return link
      }
    } catch {
      // continue
    }

    try {
      const loc = page.getByRole('button', { name: pattern }).first()
      if (await loc.isVisible({ timeout: 700 })) return loc
    } catch {
      // continue
    }
    try {
      const loc = page.getByRole('link', { name: pattern }).first()
      if (await loc.isVisible({ timeout: 700 })) return loc
    } catch {
      // continue
    }
    // Heading match then click its nearest anchor (section navigation).
    try {
      const heading = page.locator('h1, h2, h3, h4').filter({ hasText: pattern }).first()
      if (await heading.isVisible({ timeout: 700 }).catch(() => false)) {
        const id = await heading.getAttribute('id').catch(() => null)
        if (id) {
          const byId = page.locator(`#${cssEscape(id)}, a[href="#${cssEscape(id)}"]`).first()
          if (await byId.isVisible({ timeout: 400 }).catch(() => false)) return byId
          return heading
        }
        return heading
      }
    } catch {
      // continue
    }
    // Folded scan of visible links/buttons (diacritic-insensitive).
    try {
      const candidates = page.locator('a[href], button, [role="button"], [role="link"]')
      const n = Math.min(await candidates.count().catch(() => 0), 40)
      for (let i = 0; i < n; i++) {
        const el = candidates.nth(i)
        if (!(await el.isVisible({ timeout: 200 }).catch(() => false))) continue
        if (!(await locatorTextMatchesFolded(el, folded))) continue
        return el
      }
    } catch {
      // continue
    }
    try {
      const loc = page.getByText(pattern).first()
      if (await loc.isVisible({ timeout: 700 })) return loc
    } catch {
      // continue
    }
  }

  return null
}

async function performClick(page: Page, locator: Locator): Promise<void> {
  await locator.click({ timeout: 4000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
  await dismissNoise(page)
}

/** Click labels that mean “submit the search”, not “type the word recherche”. */
export function isSearchSubmitClickLabel(label: string): boolean {
  const t = label.trim()
  const quoted = extractQuotedText(t)
  if (quoted) return /^(rechercher|search)$/i.test(quoted)
  return (
    /lancer\s+la\s+recherch/i.test(t) ||
    /submit\s+(the\s+)?search/i.test(t) ||
    /^(rechercher|search)$/i.test(t) ||
    /^(click|cliquer|clique)\s+(sur\s+)?(le\s+bouton\s+)?(rechercher|search)\b/i.test(t)
  )
}

/**
 * Decide Type vs Click without letting “recherch*” in a Click label win.
 * Explicit plan actions always win; heuristics only when action is ambiguous.
 */
export function shouldExecuteAsType(step: RunnableStep): boolean {
  const action = step.action.trim().toLowerCase()
  if (action === 'click' || action === 'select') return false
  if (action === 'type' || action === 'search' || action === 'fill') return true
  if (isSearchSubmitClickLabel(step.label)) return false
  const blob = `${step.action} ${step.label}`
  // Do NOT match bare “recherch*” here — that catches Click “Lancer la recherche”.
  // “Rechercher « query »” (Type search+Enter) is covered by action === 'type' above.
  if (/^(search|rechercher)\b/i.test(step.label.trim()) && /[«"']/.test(step.label)) {
    return true
  }
  return /^(type|search|fill)\b/i.test(action) || /\b(type|taper|tape|fill|sais)\b/i.test(blob)
}

/** Dropdown / <select> — not a CTA Click (e.g. « Sélectionner Bachelor dans Brochure »). */
export function shouldExecuteAsSelect(step: RunnableStep): boolean {
  if (shouldExecuteAsType(step)) return false
  const action = step.action.trim().toLowerCase()
  if (action === 'select' || action === 'choose') {
    // Bare “Select Brochure” as a nav CTA stays Click; “dans le champ …” is a dropdown.
    if (/\b(dans|in|from|champ|field|liste|menu|dropdown)\b/i.test(`${step.action} ${step.label}`)) {
      return true
    }
    if (action === 'select') return true
  }
  return (
    /\b(sélectionner|selectionner|choisir)\b/i.test(step.label) &&
    /\b(dans|in|from|champ|liste|menu)\b/i.test(step.label)
  )
}

export function shouldExecuteAsClick(step: RunnableStep): boolean {
  if (shouldExecuteAsType(step) || shouldExecuteAsSelect(step)) return false
  const action = step.action.trim().toLowerCase()
  if (action === 'click') return true
  const blob = `${step.action} ${step.label}`
  return /click|select|choose|choisis|sélectionne|ouvre|clique|lancer\s+la\s+recherch/i.test(blob)
}

/**
 * Run one step and return a screenshot. Click/Type shots include a blue
 * highlight around the interacted element (baked into the JPEG).
 */
async function executeStepWithCapture(
  page: Page,
  step: RunnableStep,
  seedUrl: string | null,
  runnerLocale: RunnerLocale = 'en',
  destinationUrl: string | null = null,
): Promise<RunnerFrame> {
  const action = step.action.trim().toLowerCase()
  const blob = `${step.action} ${step.label}`
  const url =
    extractUrl(step.href) || extractUrl(step.target) || extractUrl(step.label) || null

  if (
    action === 'navigate' ||
    (Boolean(url) && /navigate|go to|open url|va sur|ouvre https?/i.test(blob)) ||
    (/navigate|go to|open url|va sur|ouvre https?/i.test(blob) && Boolean(url || seedUrl))
  ) {
    const dest = url || seedUrl
    if (!dest) throw new Error('No URL to navigate to')
    const market = marketCountryFor(runnerLocale, destinationUrl)
    await applyMarketCookies(page.context(), dest, market)
    await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 35000 })
    // CMPs (Didomi…) often inject after first paint — wait then dismiss once.
    await page.waitForTimeout(700)
    await dismissNoise(page)
    await scrollToUrlHash(page, dest)
    // If this Navigate targeted the user destination (or we already should be there), hold the contract.
    if (destinationUrl && (urlPathKey(dest) === urlPathKey(destinationUrl) || isDeepUrl(dest))) {
      await enforceUserDestination(page, destinationUrl, runnerLocale)
    }
    return captureFrame(page)
  }

  if (shouldExecuteAsSelect(step)) {
    const loc = await resolveSelectLocator(page, step)
    if (!loc) {
      // Soft fallback: fill any empty brochure selects so the run can continue.
      await fillEmptyFormSelects(page)
      return captureFrame(page)
    }
    const frame = await captureHighlighted(page, loc)
    await performSelect(page, loc, step)
    return frame
  }

  if (shouldExecuteAsType(step)) {
    // Credential Types: never yank back to a sticky /login destination — the
    // gateway Click may have opened SSO, a modal, or a deeper auth path.
    if (destinationUrl && !isCredentialTypeStep(step) && !isAuthGatewayPath(destinationUrl)) {
      await enforceUserDestination(page, destinationUrl, runnerLocale)
    }
    const value = searchQueryFromStep(step)
    let loc = await resolveTypeLocator(page, step)
    if (loc) {
      try {
        if (isPhoneFieldStep(step) && runnerLocale === 'fr') {
          await ensurePhoneCountry(page, loc, 'fr')
        }
        await fillField(loc, value)
        if (isPhoneFieldStep(step) && runnerLocale === 'fr') {
          await ensurePhoneCountry(page, loc, 'fr')
        }
      } catch {
        loc = null
      }
    }
    // Last resort for search-only steps — never for lead/brochure forms.
    if (!loc && isSearchTypeStep(step)) {
      loc = await fillLikelySearch(page, value)
    }
    if (!loc) {
      throw new Error(
        `Could not find the form field for: ${step.label}. Refusing to type into an unrelated input.`,
      )
    }
    const searchSubmit = isSearchTypeStep(step) || (await isSearchFieldLocator(loc))
    // Evidence for Type must show the filled value — capture before typeahead/Enter
    // navigates away (otherwise the field looks empty on the next page).
    const frame = await captureHighlighted(page, loc)
    if (searchSubmit) {
      await submitSearchAfterType(page, step, loc, value)
    } else {
      await submitSearchAfterType(page, step, loc, value)
    }
    return frame
  }

  if (shouldExecuteAsClick(step)) {
    // Cookie / CMP steps: resolve Didomi/OneTrust (incl. “Continuer sans accepter”),
    // highlight before click, and no-op if the banner was already cleared.
    if (isConsentStep(step)) {
      const hint =
        step.targetHint ||
        extractQuotedText(step.label) ||
        step.label
          .replace(/^(click|cliquer|clique|select|choisis)\s+(sur\s+)?/i, '')
          .trim()
      const prefer: 'refuse' | 'accept' | 'auto' = /sans accepter|refus|reject|deny|disagree/i.test(
        `${step.label} ${hint}`,
      )
        ? 'refuse'
        : /tout accepter|accept all|agree/i.test(`${step.label} ${hint}`)
          ? 'accept'
          : 'auto'
      let loc = await findConsentButton(page, prefer, hint)
      if (!loc) {
        await page.waitForTimeout(600)
        loc = await findConsentButton(page, prefer, hint)
      }
      if (loc) {
        const frame = await captureHighlighted(page, loc)
        await loc.click({ timeout: 4000 }).catch(() => undefined)
        await page.waitForTimeout(400)
        await dismissNoise(page)
        return frame
      }
      // Banner already gone (auto-dismissed on Navigate) — don't invent a second cookie fail.
      await dismissNoise(page)
      if (!(await consentBannerVisible(page))) {
        return captureFrame(page)
      }
      throw new Error(`Could not click consent control for: ${step.label}`)
    }

    // Submit/download CTAs only — not form-entry clicks like « Brochure » / « Contact ».
    const isSubmitLike =
      /télécharge|download|submit|envoyer|valider|je\s+télécharge/i.test(step.label) ||
      (/inscription|sign[- ]?up/i.test(step.label) &&
        !/ouvrir|open|cliquer|click/i.test(step.label))
    const isFormEntryClick =
      /brochure|contact|devis|demo|essai|lead|formulaire|connexion|login|sign[- ]?in|je\s+me\s+connecte/i.test(
        step.label,
      ) && !isSubmitLike

    // Before submit / download CTAs, clear empty required selects + check required consents.
    if (isSubmitLike) {
      if (destinationUrl && !isAuthGatewayPath(destinationUrl)) {
        await enforceUserDestination(page, destinationUrl, runnerLocale)
      }
      await prepareFormForSubmit(page)
    }

    /**
     * Product rule — search submit is idempotent:
     * - If Type already navigated away and the search box is empty, do not click Search again
     *   (that would often submit an empty query and leave the destination).
     * - If we are on a results page, open the first visible main-content link instead of
     *   re-submitting the same search.
     */
    if (isSearchSubmitClickLabel(step.label)) {
      if (pageLooksLikeSearchResults(page.url())) {
        const primary = page
          .locator('main a[href], [role="main"] a[href], article a[href], [role="list"] a[href], .search-result a[href], .results a[href]')
          .first()
        if (await primary.isVisible({ timeout: 1500 }).catch(() => false)) {
          const frame = await captureHighlighted(page, primary)
          await performClick(page, primary)
          return frame
        }
        return captureFrame(page)
      }
      const query = await searchInputValue(page)
      if (!query) {
        return captureFrame(page)
      }
    }

    // Product rule — Click is idempotent when the destination is already open.
    const clickHints = [
      step.targetHint,
      extractQuotedText(step.label),
      step.label
        .replace(/^(click|select|choose|open|choisis|sélectionne|ouvre|clique|cliquer)\s+/i, '')
        .replace(/^(sur\s+)?(le\s+|la\s+|l['’]\s*)?(lien|bouton|onglet|menu|section)\s+/i, '')
        .replace(/^(sur\s+)/i, '')
        .trim(),
    ].filter((v): v is string => Boolean(v && v.length > 2 && v.length < 80))
    const pageTitle = await page.title().catch(() => '')
    for (const hint of clickHints) {
      if (alreadyOnClickTargetPage(page.url(), pageTitle, hint)) {
        return captureFrame(page)
      }
    }

    const loc = await resolveClickLocator(page, step)
    if (loc) {
      // Capture with blue box BEFORE the click (element may disappear after navigation).
      let frame = await captureHighlighted(page, loc)
      await performClick(page, loc)
      const clickedHref = step.href || null
      if (clickedHref?.includes('#') || urlHash(page.url())) {
        await scrollToUrlHash(page, clickedHref?.startsWith('#') ? resolveHrefAgainstPage(page.url(), clickedHref) : page.url())
      }
      // Brochure/contact form-entry only — never snap auth gateway clicks back to /login.
      const isLoginGatewayClick =
        /connexion|login|sign[- ]?in|se\s+connecter|je\s+me\s+connecte/i.test(step.label)
      if (
        destinationUrl &&
        !isAuthGatewayPath(destinationUrl) &&
        !isLoginGatewayClick &&
        (isFormEntryClick || Boolean(step.href && isDeepUrl(step.href)))
      ) {
        await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => undefined)
        const corrected = await enforceUserDestination(page, destinationUrl, runnerLocale)
        if (corrected) frame = await captureFrame(page)
      }
      return frame
    }
    // Fallback: direct navigation when only an href is known (no visible target).
    const href = step.href || (step.target && /^https?:\/\//i.test(step.target) ? step.target : null)
    if (href) {
      const navigateHref = href.startsWith('#') ? resolveHrefAgainstPage(page.url(), href) : href
      const market = marketCountryFor(runnerLocale, destinationUrl || navigateHref)
      await applyMarketCookies(page.context(), navigateHref, market)
      await page.goto(navigateHref, { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissNoise(page)
      await scrollToUrlHash(page, navigateHref)
      if (destinationUrl) {
        await enforceUserDestination(page, destinationUrl, runnerLocale)
      }
      return captureFrame(page)
    }
    // “Lancer la recherche” / Search submit with no visible button → Enter in focused field.
    if (isSearchSubmitClickLabel(step.label)) {
      const frame = await captureFrame(page)
      await page.keyboard.press('Enter')
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
      return frame
    }
    throw new Error(`Could not click target for: ${step.label}`)
  }

  // Verify — assert critical-path success when a targetHint is provided.
  await new Promise((resolve) => setTimeout(resolve, 500))
  let verifyLoc: Locator | null = null
  if (step.targetHint) {
    const hint = step.targetHint.trim()
    const pattern = diacriticInsensitiveRegExp(hint.slice(0, 48))
    const folded = foldDiacritics(hint).slice(0, 48)
    const tokens = significantVerifyTokens(hint)
    verifyLoc = page.getByText(pattern).first()
    let visible = await verifyLoc
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false)
    if (!visible) {
      // Contiguous folded match on headings/body.
      const nodes = page.locator('h1, h2, h3, h4, h5, main, article, [role="main"]')
      const n = Math.min(await nodes.count().catch(() => 0), 30)
      for (let i = 0; i < n; i++) {
        const el = nodes.nth(i)
        if (!(await el.isVisible({ timeout: 200 }).catch(() => false))) continue
        if (!(await locatorTextMatchesFolded(el, folded))) continue
        verifyLoc = el
        visible = true
        break
      }
    }
    if (!visible && tokens.length > 0) {
      // Soft Verify: plan phrasing may not match DOM headings 1:1.
      // Require all significant tokens in one heading, or last token in a heading
      // while all tokens appear in the main content.
      const headings = page.locator('h1, h2, h3, h4, h5')
      const hCount = Math.min(await headings.count().catch(() => 0), 50)
      for (let i = 0; i < hCount; i++) {
        const el = headings.nth(i)
        if (!(await el.isVisible({ timeout: 150 }).catch(() => false))) continue
        const text = foldDiacritics(await el.innerText().catch(() => '')).toLowerCase()
        if (tokens.every((t) => text.includes(t))) {
          verifyLoc = el
          visible = true
          break
        }
      }
      if (!visible) {
        // Prefer the most specific heading that matches the last token
        // while other tokens appear elsewhere (hash section + subsection).
        const last = tokens[tokens.length - 1]!
        for (let i = 0; i < hCount; i++) {
          const el = headings.nth(i)
          if (!(await el.isVisible({ timeout: 150 }).catch(() => false))) continue
          const text = foldDiacritics(await el.innerText().catch(() => '')).toLowerCase()
          if (!text.includes(last)) continue
          const main = page.locator('main, [role="main"], article, body').first()
          const body = foldDiacritics(await main.innerText().catch(() => '')).toLowerCase()
          if (tokens.every((t) => body.includes(t))) {
            verifyLoc = el
            visible = true
            break
          }
        }
      }
    }
    if (!visible) {
      // Also try role/landmark-ish login success signals when hint is generic.
      const alt = page
        .locator(
          'a:has-text("Déconnexion"), a:has-text("Logout"), a:has-text("Mon compte"), [aria-label*="logout" i], [aria-label*="déconnexion" i]',
        )
        .first()
      const altOk = await alt
        .waitFor({ state: 'visible', timeout: 2500 })
        .then(() => true)
        .catch(() => false)
      if (altOk) {
        return captureHighlighted(page, alt)
      }
      throw new Error(
        `Verify failed — could not find « ${step.targetHint} » on the page after the critical path.`,
      )
    }
  } else if (step.target && !/^https?:\/\//i.test(step.target)) {
    verifyLoc = page.locator(step.target).first()
    await verifyLoc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined)
  }
  if (verifyLoc) {
    try {
      if (await verifyLoc.isVisible({ timeout: 400 })) {
        return captureHighlighted(page, verifyLoc)
      }
    } catch {
      // plain capture
    }
  }
  // Vague Verify with no hint — observe only (cannot invent a success signal).
  return captureFrame(page)
}

export async function launchBrowser(): Promise<Browser> {
  const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  // Vercel / Lambda: use the lightweight Chromium build that fits serverless.
  if (onServerless) {
    const sparticuz = (await import('@sparticuz/chromium')).default
    const { chromium } = await import('playwright-core')
    return chromium.launch({
      args: sparticuz.args,
      executablePath: await sparticuz.executablePath(),
      headless: true,
    })
  }

  // Local / dedicated host: full Playwright Chromium (or system Chrome).
  const { chromium } = await import('playwright')
  const executablePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    process.env.CHROME_PATH ||
    undefined

  return chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

/** Prefer FR for French UI or French-market hosts (hetic.net, *.fr). */
export function resolveRunnerLocale(
  preferredLanguage?: 'en' | 'fr' | null,
  seedUrl?: string | null,
): RunnerLocale {
  if (preferredLanguage === 'fr' || preferredLanguage === 'en') return preferredLanguage
  if (seedUrl && /(^|\.)hetic\.net|\.fr(\/|$)/i.test(seedUrl)) return 'fr'
  return 'en'
}

/**
 * Localized browser page so forms match what a FR (or EN) visitor sees —
 * phone country defaults, geo-gated fields, Accept-Language, market cookies,
 * and spoofed IP-geo APIs (Vercel egress is often US).
 */
export async function createLocalizedPage(
  browser: Browser,
  options?: {
    preferredLanguage?: 'en' | 'fr' | null
    seedUrl?: string | null
    destinationUrl?: string | null
  },
): Promise<Page> {
  const lang = resolveRunnerLocale(options?.preferredLanguage, options?.seedUrl)
  const isFr = lang === 'fr'
  const market = marketCountryFor(lang, options?.destinationUrl)
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: isFr ? 'fr-FR' : 'en-US',
    timezoneId: isFr ? 'Europe/Paris' : 'America/New_York',
    geolocation: isFr
      ? { latitude: 48.8566, longitude: 2.3522 }
      : { latitude: 40.7128, longitude: -74.006 },
    permissions: ['geolocation'],
    extraHTTPHeaders: {
      'Accept-Language': isFr ? 'fr-FR,fr;q=0.9,en;q=0.5' : 'en-US,en;q=0.9',
    },
  })
  await installDestinationUrlGuard(context, options?.destinationUrl ?? null)
  // Register geo mocks AFTER the destination guard so they win for ipinfo/etc.
  await installGeoApiMocks(context, market)
  const cookieHost = options?.destinationUrl || options?.seedUrl
  if (cookieHost) {
    await applyMarketCookies(context, cookieHost, market)
  }
  return context.newPage()
}

/** Force intl-tel-input (and similar) to FR when the UI locale is French. */
async function ensurePhoneCountry(
  page: Page,
  phoneInput: Locator,
  countryCode: 'fr' | 'us',
): Promise<void> {
  try {
    const wrapper = phoneInput.locator('xpath=ancestor::*[contains(@class,"iti")][1]')
    if ((await wrapper.count()) === 0) return
    const flag = wrapper.locator('.iti__selected-flag, .iti__selected-country, button.iti__selected-country').first()
    if (!(await flag.isVisible({ timeout: 500 }).catch(() => false))) return
    const meta =
      `${(await flag.getAttribute('title')) ?? ''} ${(await flag.getAttribute('aria-label')) ?? ''} ${(await flag.getAttribute('data-country-code')) ?? ''}`
    if (countryCode === 'fr' && /(france|\+33|\bfr\b)/i.test(meta)) return
    if (countryCode === 'us' && /(united states|\+1|\bus\b)/i.test(meta)) return
    await flag.click({ timeout: 2000 })
    const option = page
      .locator(
        [
          `.iti__country-list li[data-country-code="${countryCode}"]`,
          `.iti__country[data-country-code="${countryCode}"]`,
          `li[data-country-code="${countryCode}"]`,
        ].join(', '),
      )
      .first()
    if (await option.isVisible({ timeout: 2000 }).catch(() => false)) {
      await option.click({ timeout: 2000 })
      await page.waitForTimeout(200)
    } else {
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  } catch {
    // Best-effort — don't fail the Type step on country widget quirks.
  }
}

/**
 * Geo-gated brochure forms sometimes show an empty "- Select -" dropdown
 * that the Discovery plan never listed. Pick the first real option so submit works.
 * Retries briefly so cascading selects (program → campus) can populate.
 */
async function fillEmptyFormSelects(page: Page): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    let filled = 0
    const selects = page.locator('form select, select:visible')
    const count = await selects.count().catch(() => 0)
    for (let i = 0; i < Math.min(count, 12); i++) {
      const sel = selects.nth(i)
      try {
        if (!(await sel.isVisible({ timeout: 300 }).catch(() => false))) continue
        const selectedText = await sel
          .evaluate((el) => {
            const s = el as HTMLSelectElement
            return (s.options[s.selectedIndex]?.textContent || '').trim()
          })
          .catch(() => '')
        const value = await sel.inputValue().catch(() => '')
        const empty =
          !value ||
          value === '_none' ||
          value === '0' ||
          /^-?\s*select\s*-?$/i.test(selectedText) ||
          /^(choisir|sélectionner|selectionner|please select)/i.test(selectedText)
        if (!empty) continue

        const optionCount = await sel.locator('option').count()
        for (let j = 0; j < optionCount; j++) {
          const opt = sel.locator('option').nth(j)
          const v = (await opt.getAttribute('value')) ?? ''
          const t = ((await opt.textContent()) || '').trim()
          if (!v || v === '_none' || v === '0') continue
          if (/^-?\s*select\s*-?$/i.test(t)) continue
          if (/^(choisir|sélectionner|selectionner|please select)/i.test(t)) continue
          await sel.selectOption({ value: v })
          filled += 1
          await page.waitForTimeout(250)
          break
        }
      } catch {
        // continue
      }
    }
    if (filled === 0) break
    await page.waitForTimeout(350)
  }
}

/**
 * Check required / consent checkboxes that often gate submit buttons.
 * Generic across lead forms — not site-specific.
 */
async function checkRequiredFormControls(page: Page): Promise<void> {
  const boxes = page.locator(
    [
      'form input[type="checkbox"][required]',
      'form input[type="checkbox"][aria-required="true"]',
      'form input[type="checkbox"].required',
      'form input[type="checkbox"]',
    ].join(', '),
  )
  const count = await boxes.count().catch(() => 0)
  for (let i = 0; i < Math.min(count, 16); i++) {
    const box = boxes.nth(i)
    try {
      if (!(await box.isVisible({ timeout: 250 }).catch(() => false))) continue
      if (await box.isChecked().catch(() => true)) continue

      const required = await box.evaluate((el) => {
        const input = el as HTMLInputElement
        if (input.required || input.getAttribute('aria-required') === 'true') return true
        if (/\brequired\b/i.test(input.className)) return true
        const label =
          input.labels && input.labels[0]
            ? input.labels[0].textContent || ''
            : ''
        const blob = `${input.name} ${input.id} ${input.value} ${label}`
        return /accept|consent|rgpd|gdpr|privacy|cgu|cgv|politique|contact[ée]|j['’]accepte|i agree|opt[- ]?in/i.test(
          blob,
        )
      })
      if (!required) continue

      await box.check({ timeout: 2000 }).catch(async () => {
        await box.click({ timeout: 2000 }).catch(() => undefined)
      })
      await page.waitForTimeout(120)
    } catch {
      // continue
    }
  }
}

async function prepareFormForSubmit(page: Page): Promise<void> {
  await fillEmptyFormSelects(page)
  await checkRequiredFormControls(page)
}

async function resolveSelectLocator(page: Page, step: RunnableStep): Promise<Locator | null> {
  const hints = fieldHintsFromStep(step)
  const quoted = extractQuotedText(step.label)
  const blobHints = [
    ...hints,
    step.targetHint,
    quoted,
    step.label.match(/\b(?:dans|in|from)\s+(?:le\s+|la\s+|l['’])?(?:champ\s+|liste\s+|menu\s+)?["«]?([^"»]+?)["»]?\s*$/i)?.[1],
  ].filter((h): h is string => Boolean(h && h.trim()))

  for (const hint of blobHints) {
    const h = hint.trim()
    if (h.length < 2) continue
    try {
      const byLabel = page.getByLabel(h, { exact: false }).first()
      if (await byLabel.evaluate((el) => el.tagName === 'SELECT').catch(() => false)) {
        if (await byLabel.isVisible({ timeout: 600 })) return byLabel
      }
    } catch {
      // continue
    }
    const byName = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            [
              `select[name*="${h}" i]`,
              `select[id*="${h}" i]`,
              `select[aria-label*="${h}" i]`,
            ].join(', '),
          )
          .first(),
      600,
    )
    if (byName) return byName
  }

  // Brochure / formation dropdowns on lead forms.
  if (/brochure|formation|program|niveau|campus/i.test(step.label)) {
    const loc = await tryVisibleLocator(
      page,
      () =>
        page
          .locator(
            [
              'select[name*="brochure" i]',
              'select[id*="brochure" i]',
              'select[name*="formation" i]',
              'form select',
            ].join(', '),
          )
          .first(),
      800,
    )
    if (loc) return loc
  }

  return tryVisibleLocator(page, () => page.locator('form select, select').first(), 600)
}

async function performSelect(page: Page, locator: Locator, step: RunnableStep): Promise<void> {
  const value =
    extractQuotedText(step.label) ||
    (step.targetHint && !looksLikeFieldName(step.targetHint) ? step.targetHint.trim() : '') ||
    ''
  if (value) {
    await locator.selectOption({ label: value }).catch(async () => {
      await locator.selectOption({ value }).catch(async () => {
        await fillEmptyFormSelects(page)
      })
    })
  } else {
    await fillEmptyFormSelects(page)
  }
  await page.waitForTimeout(200)
}

export async function runJourneyWithPlaywright(options: {
  steps: RunnableStep[]
  prompt?: string
  siteUrl?: string | null
  preferredLanguage?: 'en' | 'fr' | null
  signal?: AbortSignal
  onEvent: (event: RunnerEvent) => void | Promise<void>
}): Promise<void> {
  const { steps, prompt, siteUrl, preferredLanguage, signal, onEvent } = options
  if (steps.length === 0) {
    await onEvent({ type: 'error', error: 'No steps to run' })
    return
  }

  const seedUrl = guessSeedUrl(steps, prompt, siteUrl)
  const destinationUrl = guessDestinationUrl(steps, prompt, siteUrl)
  const runnerLocale = resolveRunnerLocale(preferredLanguage, seedUrl || siteUrl)
  let browser: Browser | null = null

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('Aborted')
  }

  try {
    await onEvent({ type: 'status', text: 'Launching Playwright browser…' })
    browser = await launchBrowser()
    throwIfAborted()

    const page = await createLocalizedPage(browser, {
      preferredLanguage,
      seedUrl,
      destinationUrl,
    })

    const firstAction = steps[0]?.action.trim().toLowerCase() ?? ''
    const firstIsNavigate = /navigate|go to|open/i.test(firstAction)
    // Pre-open homepage only when the first step is not already a Navigate
    // (avoids double-load / teleporting past the planned entry).
    if (seedUrl && !firstIsNavigate) {
      await onEvent({ type: 'status', text: `Opening ${seedUrl}` })
      const market = marketCountryFor(runnerLocale, destinationUrl)
      await applyMarketCookies(page.context(), seedUrl, market)
      await page.goto(seedUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => undefined)
      await dismissNoise(page)
    }

    let ok = true
    for (let i = 0; i < steps.length; i++) {
      throwIfAborted()
      const step = steps[i]!
      await onEvent({ type: 'step_start', index: i, id: step.id, label: step.label })
      await onEvent({ type: 'status', text: `Running step ${i + 1}: ${step.label}` })

      const stepStartedAt = Date.now()
      try {
        const frame = await executeStepWithCapture(
          page,
          step,
          seedUrl,
          runnerLocale,
          destinationUrl,
        )
        throwIfAborted()
        const durationMs = Date.now() - stepStartedAt
        await onEvent({
          type: 'step_frame',
          index: i,
          id: step.id,
          label: step.label,
          ...frame,
        })
        await onEvent({
          type: 'step_done',
          index: i,
          id: step.id,
          durationMs,
          url: frame.url,
          title: frame.title,
          screenshotDataUrl: frame.screenshotDataUrl,
        })
      } catch (error) {
        ok = false
        const message = error instanceof Error ? error.message : 'Step failed'
        const durationMs = Date.now() - stepStartedAt
        let frame: Partial<RunnerFrame> = {}
        try {
          frame = await captureFrame(page)
        } catch {
          // ignore capture failure
        }
        await onEvent({
          type: 'step_failed',
          index: i,
          id: step.id,
          label: step.label,
          error: message,
          durationMs,
          url: frame.url,
          title: frame.title,
          screenshotDataUrl: frame.screenshotDataUrl,
        })
        break
      }
    }

    await onEvent({ type: 'done', ok })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Playwright run failed'
    if (message !== 'Aborted') {
      await onEvent({ type: 'error', error: message })
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

export type DryRunResult = {
  ok: boolean
  stepsOk: number
  failedIndex: number | null
  failedLabel: string | null
  error: string | null
}

/**
 * Fast headless rehearsal (no screenshots) to validate a plan before showing Run.
 */
export async function dryRunJourneyWithPlaywright(options: {
  steps: RunnableStep[]
  prompt?: string
  siteUrl?: string | null
  preferredLanguage?: 'en' | 'fr' | null
  deadlineMs?: number
  onStatus?: (text: string) => void
}): Promise<DryRunResult> {
  const { steps, prompt, siteUrl, preferredLanguage, onStatus } = options
  const deadlineMs = options.deadlineMs ?? 18_000
  const started = Date.now()
  const timeLeft = () => deadlineMs - (Date.now() - started)

  if (steps.length === 0) {
    return { ok: false, stepsOk: 0, failedIndex: null, failedLabel: null, error: 'No steps' }
  }

  const seedUrl = guessSeedUrl(steps, prompt, siteUrl)
  const destinationUrl = guessDestinationUrl(steps, prompt, siteUrl)
  const runnerLocale = resolveRunnerLocale(preferredLanguage, seedUrl || siteUrl)
  let browser: Browser | null = null

  try {
    onStatus?.('Rehearsing the journey in the browser…')
    browser = await launchBrowser()
    const page = await createLocalizedPage(browser, {
      preferredLanguage,
      seedUrl,
      destinationUrl,
    })

    const firstAction = steps[0]?.action.trim().toLowerCase() ?? ''
    const firstIsNavigate = /navigate|go to|open/i.test(firstAction)
    if (seedUrl && !firstIsNavigate && timeLeft() > 3_000) {
      const market = marketCountryFor(runnerLocale, destinationUrl)
      await applyMarketCookies(page.context(), seedUrl, market)
      await page.goto(seedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(20_000, timeLeft()),
      }).catch(() => undefined)
      await dismissNoise(page)
    }

    let stepsOk = 0
    for (let i = 0; i < steps.length; i++) {
      if (timeLeft() < 2_500) {
        return {
          ok: false,
          stepsOk,
          failedIndex: i,
          failedLabel: steps[i]?.label ?? null,
          error: 'Dry-run deadline reached',
        }
      }
      const step = steps[i]!
      try {
        // Reuse the live path (including highlight) so dry-run matches production.
        await executeStepWithCapture(page, step, seedUrl, runnerLocale, destinationUrl)
        stepsOk += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Step failed'
        return {
          ok: false,
          stepsOk,
          failedIndex: i,
          failedLabel: step.label,
          error: message,
        }
      }
    }

    return { ok: true, stepsOk, failedIndex: null, failedLabel: null, error: null }
  } catch (error) {
    return {
      ok: false,
      stepsOk: 0,
      failedIndex: null,
      failedLabel: null,
      error: error instanceof Error ? error.message : 'Dry-run failed',
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }
}
