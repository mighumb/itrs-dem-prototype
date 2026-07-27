import type { Browser, Locator, Page } from 'playwright-core'

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
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return path !== '/' || Boolean(u.search) || Boolean(u.hash)
  } catch {
    return false
  }
}

function homepageOf(url: string): string {
  try {
    return `${new URL(url).origin}/`
  } catch {
    return url
  }
}

/** Prefer homepage as seed — deep links are destinations, not entry points. */
function guessSeedUrl(steps: RunnableStep[], prompt?: string): string | null {
  for (const step of steps) {
    const raw =
      extractUrl(step.href) || extractUrl(step.target) || extractUrl(step.label)
    if (raw) return isDeepUrl(raw) ? homepageOf(raw) : raw
  }
  const fromPrompt = extractUrl(prompt ?? null)
  if (fromPrompt) return isDeepUrl(fromPrompt) ? homepageOf(fromPrompt) : fromPrompt
  return null
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

export async function dismissNoise(page: Page) {
  const candidates = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Tout accepter")',
    'button:has-text("Accepter")',
    'button:has-text("OK")',
    '[aria-label="Close"]',
    'button[aria-label="Close"]',
  ]
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 400 })) {
        await loc.click({ timeout: 1000 })
        await page.waitForTimeout(300)
        return
      }
    } catch {
      // ignore
    }
  }
}

async function findSearchLocator(page: Page): Promise<Locator | null> {
  const selectors = [
    'input[type="search"]',
    'input[name="q"]',
    'input[name="query"]',
    'input[placeholder*="Search" i]',
    'input[placeholder*="Recherch" i]',
    'input[aria-label*="Search" i]',
    'input[type="text"]',
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

function searchQueryFromStep(step: RunnableStep): string {
  const label = step.label
  const patterns = [
    /search(?:\s+for)?\s+(.+)/i,
    /recherch(?:e|er)?\s+(.+)/i,
    /type\s+(.+)/i,
    /sais(?:ir|ie)\s+(.+)/i,
  ]
  for (const re of patterns) {
    const m = label.match(re)
    if (m?.[1]) return m[1].replace(/\s+and\b.*$/i, '').trim()
  }
  return label
}

/** Resolve a clickable locator without performing the click. */
async function resolveClickLocator(page: Page, step: RunnableStep): Promise<Locator | null> {
  const href = step.href || (step.target && /^https?:\/\//i.test(step.target) ? step.target : null)
  if (href) {
    try {
      let pathOnly = ''
      try {
        pathOnly = new URL(href).pathname
      } catch {
        pathOnly = ''
      }
      const selectors = [`a[href="${href}"]`]
      if (pathOnly) selectors.push(`a[href="${pathOnly}"]`)
      const byHref = page.locator(selectors.join(', ')).first()
      if (await byHref.isVisible({ timeout: 900 })) return byHref
    } catch {
      // fall through
    }
  }

  if (step.target && !/^https?:\/\//i.test(step.target)) {
    try {
      const loc = page.locator(step.target).first()
      if (await loc.isVisible({ timeout: 900 })) return loc
    } catch {
      // fall through
    }
  }

  const textHints = [
    step.targetHint,
    step.label.match(/"([^"]+)"/)?.[1],
    step.label.match(/«\s*([^»]+)\s*»/)?.[1],
    step.label
      .replace(/^(click|select|choose|open|choisis|sélectionne|ouvre|clique)\s+/i, '')
      .split(/\s+and\b/i)[0]
      ?.trim(),
  ].filter((v): v is string => Boolean(v && v.length > 1 && v.length < 80))

  for (const hint of textHints) {
    const pattern = new RegExp(hint.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
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
    try {
      const loc = page.getByText(hint, { exact: false }).first()
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

/**
 * Run one step and return a screenshot. Click/Type shots include a blue
 * highlight around the interacted element (baked into the JPEG).
 */
async function executeStepWithCapture(
  page: Page,
  step: RunnableStep,
  seedUrl: string | null,
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
    let dest = url || seedUrl
    if (!dest) throw new Error('No URL to navigate to')
    // Never teleport: if this navigate targets a deep link while seed is homepage, keep dest
    // only when the step intentionally navigates — deep dest is OK for rare one-shots.
    await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 35000 })
    await dismissNoise(page)
    return captureFrame(page)
  }

  if (action === 'type' || /type|search|fill|sais|recherch/i.test(blob)) {
    const value = searchQueryFromStep(step)
    let loc: Locator | null = null
    if (step.target && step.target.includes('input')) {
      try {
        loc = page.locator(step.target.split(',')[0]!.trim()).first()
        await loc.fill(value, { timeout: 5000 })
      } catch {
        loc = null
      }
    }
    if (!loc) {
      loc = await fillLikelySearch(page, value)
    }
    const frame = await captureHighlighted(page, loc)
    await page.keyboard.press('Enter')
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
    return frame
  }

  if (action === 'click' || /click|select|choose|choisis|sélectionne|ouvre|clique/i.test(blob)) {
    const loc = await resolveClickLocator(page, step)
    if (loc) {
      // Capture with blue box BEFORE the click (element may disappear after navigation).
      const frame = await captureHighlighted(page, loc)
      await performClick(page, loc)
      return frame
    }
    // Fallback: direct navigation when only an href is known (no visible target).
    const href = step.href || (step.target && /^https?:\/\//i.test(step.target) ? step.target : null)
    if (href) {
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissNoise(page)
      return captureFrame(page)
    }
    throw new Error(`Could not click target for: ${step.label}`)
  }

  // Verify / wait / unknown — observe current page; highlight the checked text when possible.
  await new Promise((resolve) => setTimeout(resolve, 500))
  let verifyLoc: Locator | null = null
  if (step.targetHint) {
    verifyLoc = page.getByText(step.targetHint, { exact: false }).first()
    await verifyLoc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined)
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

export async function runJourneyWithPlaywright(options: {
  steps: RunnableStep[]
  prompt?: string
  signal?: AbortSignal
  onEvent: (event: RunnerEvent) => void | Promise<void>
}): Promise<void> {
  const { steps, prompt, signal, onEvent } = options
  if (steps.length === 0) {
    await onEvent({ type: 'error', error: 'No steps to run' })
    return
  }

  const seedUrl = guessSeedUrl(steps, prompt)
  let browser: Browser | null = null

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('Aborted')
  }

  try {
    await onEvent({ type: 'status', text: 'Launching Playwright browser…' })
    browser = await launchBrowser()
    throwIfAborted()

    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })

    const firstAction = steps[0]?.action.trim().toLowerCase() ?? ''
    const firstIsNavigate = /navigate|go to|open/i.test(firstAction)
    // Pre-open homepage only when the first step is not already a Navigate
    // (avoids double-load / teleporting past the planned entry).
    if (seedUrl && !firstIsNavigate) {
      await onEvent({ type: 'status', text: `Opening ${seedUrl}` })
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
        const frame = await executeStepWithCapture(page, step, seedUrl)
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
  deadlineMs?: number
  onStatus?: (text: string) => void
}): Promise<DryRunResult> {
  const { steps, prompt, onStatus } = options
  const deadlineMs = options.deadlineMs ?? 18_000
  const started = Date.now()
  const timeLeft = () => deadlineMs - (Date.now() - started)

  if (steps.length === 0) {
    return { ok: false, stepsOk: 0, failedIndex: null, failedLabel: null, error: 'No steps' }
  }

  const seedUrl = guessSeedUrl(steps, prompt)
  let browser: Browser | null = null

  try {
    onStatus?.('Rehearsing the journey in the browser…')
    browser = await launchBrowser()
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    })

    const firstAction = steps[0]?.action.trim().toLowerCase() ?? ''
    const firstIsNavigate = /navigate|go to|open/i.test(firstAction)
    if (seedUrl && !firstIsNavigate && timeLeft() > 3_000) {
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
        await executeStepWithCapture(page, step, seedUrl)
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
