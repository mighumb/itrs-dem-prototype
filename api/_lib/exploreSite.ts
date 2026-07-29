/**
 * Bounded Playwright crawl for Discovery evidence.
 * Visits the homepage + a few same-origin pages and builds a compact inventory
 * the LLM can treat as observed facts (not general knowledge).
 */

import type { Browser, Page } from 'playwright-core'
import {
  dismissNoise,
  launchBrowser,
  createLocalizedPage,
  enforceUserDestination,
  isDeepUrl as runnerIsDeepUrl,
  urlPathKey,
  marketCountryFor,
  type RunnerLocale,
} from './playwrightRunner.js'
import { analyzePublicSite, type SiteAnalysisResult } from './analyzeSite.js'

export type SiteExploreLink = {
  label: string
  href: string
}

export type SiteExplorePage = {
  url: string
  title: string
  heading: string | null
  links: SiteExploreLink[]
  buttons: string[]
  forms: Array<{ action: string | null; fields: string[] }>
}

export type SiteExploreResult = {
  ok: boolean
  url: string
  reason: string | null
  method: 'playwright' | 'http-fallback' | 'none'
  pagesVisited: number
  pages: SiteExplorePage[]
  /** Compact text evidence (also used as pageSnapshot). */
  snapshot: string | null
  title: string | null
}

type ExploreOptions = {
  maxPages?: number
  deadlineMs?: number
  preferredLanguage?: 'en' | 'fr' | null
  onStatus?: (text: string) => void
}

const DEFAULT_MAX_PAGES = 6
const DEFAULT_DEADLINE_MS = 20_000
const MAX_SNAPSHOT_CHARS = 9_000
const MAX_LINKS_PER_PAGE = 18
const MAX_BUTTONS_PER_PAGE = 12
const EXPLORE_CACHE_TTL_MS = 15 * 60 * 1000

type ExploreCacheEntry = {
  expires: number
  explore: SiteExploreResult
  analysis: SiteAnalysisResult
}

const exploreCache = new Map<string, ExploreCacheEntry>()

function cacheKeyFor(url: string, market: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    // Path + market matter: /brochure (FR) must not reuse /brochure-inter (US) cache.
    return `${u.origin}${path}|${market}`
  } catch {
    return `${url}|${market}`
  }
}

/** Read a still-fresh explore result without re-crawling (used on later Discovery turns). */
export function peekExploreCache(url: string | null | undefined): SiteExploreResult | null {
  if (!url) return null
  // Prefer exact path+any market hit; fall back to scanning keys for same origin+path.
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    const prefix = `${u.origin}${path}|`
    for (const [key, entry] of exploreCache) {
      if (!key.startsWith(prefix)) continue
      if (entry.expires <= Date.now()) continue
      return entry.explore
    }
  } catch {
    // fall through
  }
  return null
}

type RawInventory = {
  title: string
  heading: string | null
  links: Array<{ label: string; href: string }>
  buttons: string[]
  forms: Array<{ action: string | null; fields: string[] }>
}

function t(lang: 'en' | 'fr', en: string, fr: string): string {
  return lang === 'fr' ? fr : en
}

/** Crude eTLD+1 key so www ↔ apex and language subdomains can be crawled. */
function registrableKey(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const sld = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu'])
  if (parts.length >= 3 && sld.has(parts[parts.length - 2]!)) {
    return parts.slice(-3).join('.')
  }
  return parts.slice(-2).join('.')
}

function relatedUrl(base: URL, href: string): string | null {
  try {
    const next = new URL(href, base)
    if (next.protocol !== 'http:' && next.protocol !== 'https:') return null
    if (registrableKey(next.hostname) !== registrableKey(base.hostname)) return null
    next.hash = ''
    return next.toString()
  } catch {
    return null
  }
}

function detectLoginWall(page: SiteExplorePage): boolean {
  const blob = `${page.title} ${page.heading ?? ''} ${page.buttons.join(' ')}`.toLowerCase()
  const hasPasswordField = page.forms.some((form) =>
    form.fields.some((field) => /pass|pwd|motdepasse|mot de passe/i.test(field)),
  )
  const loginCta = /sign in|log in|connexion|se connecter|create account/.test(blob)
  const thinContent = page.links.length < 3 && page.buttons.length < 3
  return hasPasswordField && (loginCta || thinContent)
}

function isBlockedOrThinInventory(page: SiteExplorePage): boolean {
  const blob = `${page.title ?? ''} ${page.heading ?? ''}`
  if (/403\s*forbidden|access\s*denied|\bforbidden\b|attention required|just a moment/i.test(blob)) {
    return true
  }
  return (page.links?.length ?? 0) + (page.buttons?.length ?? 0) < 2
}

/** When a deep destination is blocked, still crawl the market homepage for nav inventory. */
function enqueueHomepageFallbacks(
  queue: Array<{ url: string; score: number }>,
  visited: Set<string>,
  start: URL,
): void {
  const homes = new Set<string>([`${start.origin}/`])
  const parts = start.pathname.split('/').filter(Boolean)
  if (parts[0] && /^[a-z]{2}(?:-[a-z]{2})?$/i.test(parts[0])) {
    homes.add(`${start.origin}/${parts[0].toLowerCase()}/`)
  }
  for (const home of homes) {
    if (visited.has(home)) continue
    if (queue.some((q) => q.url === home)) continue
    queue.push({ url: home, score: 95 })
  }
}

function linkScore(label: string, href: string): number {
  const blob = `${label} ${href}`.toLowerCase()
  let score = 0
  const boosts = [
    [/\/(cart|basket|bag|checkout|panier|commande)/i, 8],
    [/\/(search|recherche|find)/i, 7],
    [/\/(book|booking|reserver|reservation|flights?|hotels?)/i, 8],
    [/\/(login|signin|connexion|account|compte|mon-compte)/i, 5],
    [/\/(product|products|shop|boutique|catalog)/i, 6],
    [/\/(destinations?|offers?|offres?|deals?)/i, 6],
    [/\/(contact|aide|help|support|faq)/i, 3],
    [/\/(brochure|devis|demo|lead|formulaire|inscription)/i, 9],
    [/\/(livres?-blanc|white-?papers?|resources?|ressources|ebooks?)/i, 9],
    [/livre\s*blanc|white\s*paper|position\s*paper|t[eé]l[eé]charg|download/i, 9],
    [/\/(about|a-propos|company)/i, 2],
  ] as const
  for (const [re, points] of boosts) {
    if (re.test(blob)) score += points
  }
  if (label.trim().length > 0 && label.trim().length <= 28) score += 2
  if ((href.match(/\//g) ?? []).length <= 3) score += 1
  if (/\.(pdf|jpg|png|gif|svg|zip|mp4)(\?|$)/i.test(href)) score -= 10
  if (/#|javascript:/i.test(href)) score -= 10
  return score
}

/**
 * Browser-side collector as a string so bundlers/tsx cannot inject helpers
 * (e.g. __name) into the Playwright evaluate payload.
 */
const COLLECT_INVENTORY_SOURCE = `(([maxLinks, maxButtons]) => {
  const textOf = (el) => (el && el.textContent ? el.textContent : '').replace(/\\s+/g, ' ').trim()
  const heading =
    textOf(document.querySelector('h1')) ||
    textOf(document.querySelector('h2')) ||
    null

  const linkMap = new Map()
  const anchors = Array.from(document.querySelectorAll('a[href]'))
  for (const a of anchors) {
    const href = a.href
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) continue
    const label = textOf(a).slice(0, 80)
    if (!label && !href) continue
    const key = (href.split('#')[0] || href)
    const score =
      (a.closest('nav, header, [role="navigation"]') ? 4 : 0) +
      (label.length > 0 && label.length <= 32 ? 2 : 0)
    const prev = linkMap.get(key)
    if (!prev || score > prev.score || (score === prev.score && label.length > prev.label.length)) {
      linkMap.set(key, { label: label || key, href: key, score })
    }
  }

  const links = Array.from(linkMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLinks)
    .map(({ label, href }) => ({ label, href }))

  const buttonTexts = new Set()
  const buttonEls = Array.from(
    document.querySelectorAll('button, [role="button"], input[type="submit"], a.button, .btn'),
  )
  for (const el of buttonEls) {
    const label =
      textOf(el) ||
      el.getAttribute('aria-label') ||
      el.getAttribute('value') ||
      ''
    const clean = label.replace(/\\s+/g, ' ').trim().slice(0, 60)
    if (clean && clean.length < 50) buttonTexts.add(clean)
    if (buttonTexts.size >= maxButtons) break
  }

  const forms = Array.from(document.querySelectorAll('form'))
    .slice(0, 5)
    .map((form) => {
      const fields = Array.from(form.querySelectorAll('input, select, textarea'))
        .map((field) => {
          const type = (field.type || field.tagName).toLowerCase()
          if (type === 'hidden' || type === 'submit' || type === 'button') return null
          return (
            field.name ||
            field.id ||
            field.getAttribute('aria-label') ||
            field.placeholder ||
            type
          )
        })
        .filter(Boolean)
        .slice(0, 8)
      return {
        action: form.getAttribute('action'),
        fields,
      }
    })
    .filter((f) => f.fields.length > 0)

  return {
    title: document.title || '',
    heading: heading ? heading.slice(0, 160) : null,
    links,
    buttons: Array.from(buttonTexts),
    forms,
  }
})`

async function collectInventory(page: Page): Promise<RawInventory> {
  // Evaluate a prebuilt JS source string (avoids TS/tsx __name injection in the browser).
  return page.evaluate(
    `${COLLECT_INVENTORY_SOURCE}(${JSON.stringify([MAX_LINKS_PER_PAGE, MAX_BUTTONS_PER_PAGE])})`,
  )
}

function buildExploreSnapshot(startUrl: string, pages: SiteExplorePage[]): string {
  const parts: string[] = [
    'METHOD: playwright-explore',
    `START_URL: ${startUrl}`,
    `PAGES_VISITED: ${pages.length}`,
    '',
    'Observed public pages (facts — do not invent links/labels beyond this list):',
  ]

  for (const page of pages) {
    parts.push('')
    parts.push(`### ${page.url}`)
    parts.push(`Title: ${page.title || '(none)'}`)
    if (page.heading) parts.push(`Heading: ${page.heading}`)
    if (page.links.length > 0) {
      parts.push('Links:')
      for (const link of page.links.slice(0, 14)) {
        parts.push(`- ${link.label} → ${link.href}`)
      }
    }
    if (page.buttons.length > 0) {
      parts.push(`Buttons/CTAs: ${page.buttons.slice(0, 10).join(' | ')}`)
    }
    if (page.forms.length > 0) {
      parts.push('Forms:')
      for (const form of page.forms) {
        parts.push(
          `- action=${form.action ?? '(none)'} fields=${form.fields.join(', ')}`,
        )
      }
    }
  }

  return parts.join('\n').slice(0, MAX_SNAPSHOT_CHARS)
}

function toAnalysis(explore: SiteExploreResult): SiteAnalysisResult {
  return {
    ok: explore.ok,
    url: explore.url,
    reason: explore.reason,
    snapshot: explore.snapshot,
    title: explore.title,
    status: explore.ok ? 200 : null,
  }
}

/**
 * Explore a public site with Playwright. Falls back to HTTP snapshot on failure.
 */
export async function explorePublicSite(
  rawUrl: string,
  options: ExploreOptions = {},
): Promise<{ explore: SiteExploreResult; analysis: SiteAnalysisResult }> {
  const lang: 'en' | 'fr' = options.preferredLanguage === 'fr' ? 'fr' : 'en'
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS
  const onStatus = options.onStatus
  const started = Date.now()
  const timeLeft = () => deadlineMs - (Date.now() - started)

  let url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  let start: URL
  try {
    start = new URL(url)
  } catch {
    const explore: SiteExploreResult = {
      ok: false,
      url,
      reason: 'Invalid URL',
      method: 'none',
      pagesVisited: 0,
      pages: [],
      snapshot: null,
      title: null,
    }
    return { explore, analysis: toAnalysis(explore) }
  }

  const destinationUrl = runnerIsDeepUrl(start.toString()) ? start.toString() : null
  const runnerLocale: RunnerLocale = lang
  const market = marketCountryFor(runnerLocale, destinationUrl)
  const cacheKey = cacheKeyFor(start.toString(), market)

  const cached = exploreCache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    onStatus?.(
      t(
        lang,
        `Reusing recent site map for ${start.hostname}`,
        `Je réutilise la carte récente de ${start.hostname}`,
      ),
    )
    return { explore: cached.explore, analysis: cached.analysis }
  }

  onStatus?.(
    t(lang, `Exploring ${start.hostname} in the browser…`, `J’explore ${start.hostname} dans le navigateur…`),
  )

  let browser: Browser | null = null
  const pages: SiteExplorePage[] = []
  const visited = new Set<string>()
  // Prefer the exact user URL first (deep path), then crawl outwards.
  const queue: Array<{ url: string; score: number }> = [{ url: start.toString(), score: 100 }]

  try {
    browser = await launchBrowser()
    const page = await createLocalizedPage(browser, {
      preferredLanguage: lang,
      seedUrl: start.toString(),
      destinationUrl,
    })

    while (queue.length > 0 && pages.length < maxPages && timeLeft() > 4_000) {
      queue.sort((a, b) => b.score - a.score)
      const next = queue.shift()
      if (!next) break

      const normalized = relatedUrl(start, next.url)
      if (!normalized || visited.has(normalized)) continue
      visited.add(normalized)

      try {
        const pathLabel = (() => {
          try {
            return new URL(normalized).pathname || '/'
          } catch {
            return '/'
          }
        })()
        if (pages.length === 0) {
          onStatus?.(
            t(
              lang,
              destinationUrl
                ? `Opening ${pathLabel}…`
                : 'Opening the homepage…',
              destinationUrl
                ? `Ouverture de ${pathLabel}…`
                : 'Ouverture de la page d’accueil…',
            ),
          )
        } else {
          onStatus?.(
            t(
              lang,
              `Checking ${pathLabel}…`,
              `Je regarde ${pathLabel}…`,
            ),
          )
        }

        await page.goto(normalized, {
          waitUntil: 'domcontentloaded',
          timeout: Math.min(18_000, Math.max(5_000, timeLeft() - 2_000)),
        })
        await dismissNoise(page)
        // Hold the user-chosen deep URL if geo redirected to a sibling path.
        if (
          destinationUrl &&
          urlPathKey(normalized) === urlPathKey(destinationUrl)
        ) {
          await enforceUserDestination(page, destinationUrl, runnerLocale)
        }
        await new Promise((resolve) => setTimeout(resolve, 450))

        const inventory = await collectInventory(page)
        let finalUrl = page.url()
        // Prefer reporting the contracted destination path (drop tracking query noise).
        if (
          destinationUrl &&
          urlPathKey(finalUrl) === urlPathKey(destinationUrl)
        ) {
          finalUrl = destinationUrl
        }
        const pageData: SiteExplorePage = {
          url: finalUrl,
          title: inventory.title,
          heading: inventory.heading,
          links: inventory.links,
          buttons: inventory.buttons,
          forms: inventory.forms,
        }
        pages.push(pageData)

        // Deep URL blocked/empty → keep exploring from the homepage so proposals
        // can use a natural path (nav / search) instead of stalling on 403.
        if (
          destinationUrl &&
          urlPathKey(normalized) === urlPathKey(destinationUrl) &&
          isBlockedOrThinInventory(pageData)
        ) {
          enqueueHomepageFallbacks(queue, visited, start)
          onStatus?.(
            t(
              lang,
              'Deep page blocked — exploring the homepage for another path…',
              'Page profonde bloquée — j’explore l’accueil pour un autre chemin…',
            ),
          )
        }

        for (const link of inventory.links) {
          const abs = relatedUrl(start, link.href)
          if (!abs || visited.has(abs)) continue
          if (queue.some((q) => q.url === abs)) continue
          // Related-host links are worth visiting even with a modest score.
          const score = Math.max(1, linkScore(link.label, abs))
          queue.push({ url: abs, score })
        }
      } catch (error) {
        // Skip unreachable page; keep exploring others.
        console.error(
          '[exploreSite] page failed',
          normalized,
          error instanceof Error ? error.message : error,
        )
      }
    }

    await browser.close()
    browser = null

    if (pages.length === 0) {
      onStatus?.(
        t(
          lang,
          'Browser explore found nothing — trying a simple page fetch…',
          'Exploration navigateur vide — je tente un fetch simple…',
        ),
      )
      const analysis = await analyzePublicSite(start.toString(), {
        preferredLanguage: lang,
      })
      const explore: SiteExploreResult = {
        ok: analysis.ok,
        url: analysis.url,
        reason: analysis.reason ?? 'Playwright explore returned no pages',
        method: analysis.ok ? 'http-fallback' : 'none',
        pagesVisited: 0,
        pages: [],
        snapshot: analysis.snapshot,
        title: analysis.title,
      }
      return { explore, analysis }
    }

    const snapshot = buildExploreSnapshot(start.toString(), pages)
    onStatus?.(
      t(
        lang,
        `Mapped ${pages.length} public page${pages.length > 1 ? 's' : ''} on ${start.hostname}`,
        `${pages.length} page${pages.length > 1 ? 's' : ''} publique${pages.length > 1 ? 's' : ''} cartographiée${pages.length > 1 ? 's' : ''} sur ${start.hostname}`,
      ),
    )

    const loginWall = pages.length > 0 && pages.every((p) => detectLoginWall(p))
    // Prefer the user-provided start URL as the explore identity when we held it.
    const primaryUrl =
      (destinationUrl &&
        pages.some((p) => urlPathKey(p.url) === urlPathKey(destinationUrl)) &&
        destinationUrl) ||
      pages[0]?.url ||
      start.toString()

    if (loginWall) {
      const explore: SiteExploreResult = {
        ok: false,
        url: primaryUrl,
        reason: 'Login-wall suspected — little public content available',
        method: 'playwright',
        pagesVisited: pages.length,
        pages,
        snapshot,
        title: pages[0]?.title ?? null,
      }
      const analysis = toAnalysis(explore)
      exploreCache.set(cacheKey, {
        expires: Date.now() + EXPLORE_CACHE_TTL_MS,
        explore,
        analysis,
      })
      return { explore, analysis }
    }

    // Bot / WAF blocks must not be treated as rich observed inventory.
    const blockedPage = pages.find((p) =>
      /403\s*forbidden|access\s*denied|\bforbidden\b|attention required|just a moment/i.test(
        `${p.title ?? ''} ${p.heading ?? ''}`,
      ),
    )
    if (blockedPage && pages.every((p) => (p.links?.length ?? 0) + (p.buttons?.length ?? 0) < 2)) {
      const explore: SiteExploreResult = {
        ok: false,
        url: primaryUrl,
        reason: 'Access blocked or challenge page — inventory incomplete',
        method: 'playwright',
        pagesVisited: pages.length,
        pages,
        snapshot,
        title: pages[0]?.title ?? null,
      }
      const analysis = toAnalysis(explore)
      exploreCache.set(cacheKey, {
        expires: Date.now() + EXPLORE_CACHE_TTL_MS,
        explore,
        analysis,
      })
      return { explore, analysis }
    }

    const explore: SiteExploreResult = {
      ok: true,
      url: primaryUrl,
      reason: null,
      method: 'playwright',
      pagesVisited: pages.length,
      pages,
      snapshot,
      title: pages[0]?.title ?? null,
    }
    const analysis = toAnalysis(explore)
    exploreCache.set(cacheKey, {
      expires: Date.now() + EXPLORE_CACHE_TTL_MS,
      explore,
      analysis,
    })
    return { explore, analysis }
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => undefined)
    }
    const message = error instanceof Error ? error.message : 'Playwright explore failed'
    onStatus?.(
      t(
        lang,
        'Browser explore failed — falling back to a simple page fetch…',
        'Échec de l’exploration navigateur — fallback fetch simple…',
      ),
    )
    const analysis = await analyzePublicSite(start.toString(), {
      preferredLanguage: lang,
    })
    const explore: SiteExploreResult = {
      ok: analysis.ok,
      url: destinationUrl || analysis.url,
      reason: analysis.ok ? `Playwright failed (${message}); used HTTP snapshot` : analysis.reason,
      method: analysis.ok ? 'http-fallback' : 'none',
      pagesVisited: 0,
      pages: [],
      snapshot: analysis.snapshot,
      title: analysis.title,
    }
    return { explore, analysis }
  }
}

/** Compact structured summary for the Gemini user prompt (keeps tokens bounded). */
export function siteExplorePromptView(explore: SiteExploreResult | null) {
  if (!explore) return null
  return {
    ok: explore.ok,
    method: explore.method,
    url: explore.url,
    reason: explore.reason,
    pagesVisited: explore.pagesVisited,
    pages: explore.pages.slice(0, 6).map((page) => ({
      url: page.url,
      title: page.title,
      heading: page.heading,
      links: page.links.slice(0, 12),
      buttons: page.buttons.slice(0, 8),
      forms: page.forms.slice(0, 3),
    })),
  }
}
