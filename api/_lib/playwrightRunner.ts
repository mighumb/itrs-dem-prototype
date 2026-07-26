import type { Browser, Page } from 'playwright-core'

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

function guessSeedUrl(steps: RunnableStep[], prompt?: string): string | null {
  for (const step of steps) {
    const fromHref = extractUrl(step.href)
    if (fromHref) return fromHref
    const fromTarget = extractUrl(step.target)
    if (fromTarget) return fromTarget
    const fromLabel = extractUrl(step.label)
    if (fromLabel) return fromLabel
  }
  return extractUrl(prompt ?? null)
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

async function fillLikelySearch(page: Page, query: string) {
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
      if (await loc.isVisible({ timeout: 600 })) {
        await loc.click({ timeout: 1000 })
        await loc.fill(query, { timeout: 2000 })
        await page.keyboard.press('Enter')
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // try next
    }
  }
  throw new Error(`Could not find a search field to type: ${query}`)
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

async function clickFromStep(page: Page, step: RunnableStep) {
  // Prefer an observed href: click the matching anchor, else navigate directly.
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
      if (await byHref.isVisible({ timeout: 900 })) {
        await byHref.click({ timeout: 4000 })
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // fall through
    }
    try {
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 25000 })
      await dismissNoise(page)
      return
    } catch {
      // fall through to text heuristics
    }
  }

  if (step.target && !/^https?:\/\//i.test(step.target)) {
    try {
      await page.locator(step.target).first().click({ timeout: 5000 })
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
      return
    } catch {
      // fall through to text heuristics
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
      if (await loc.isVisible({ timeout: 700 })) {
        await loc.click({ timeout: 4000 })
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // continue
    }
    try {
      const loc = page.getByRole('link', { name: pattern }).first()
      if (await loc.isVisible({ timeout: 700 })) {
        await loc.click({ timeout: 4000 })
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // continue
    }
    try {
      const loc = page.getByText(hint, { exact: false }).first()
      if (await loc.isVisible({ timeout: 700 })) {
        await loc.click({ timeout: 4000 })
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // continue
    }
  }

  throw new Error(`Could not click target for: ${step.label}`)
}

async function executeStep(page: Page, step: RunnableStep, seedUrl: string | null) {
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
    await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 35000 })
    await dismissNoise(page)
    return
  }

  if (action === 'type' || /type|search|fill|sais|recherch/i.test(blob)) {
    if (step.target && step.target.includes('input')) {
      try {
        const value = searchQueryFromStep(step)
        await page.locator(step.target.split(',')[0]!.trim()).first().fill(value, { timeout: 5000 })
        await page.keyboard.press('Enter')
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      } catch {
        // fallback
      }
    }
    await fillLikelySearch(page, searchQueryFromStep(step))
    return
  }

  if (action === 'click' || /click|select|choose|choisis|sélectionne|ouvre|clique/i.test(blob)) {
    await clickFromStep(page, step)
    await dismissNoise(page)
    return
  }

  // Verify / wait / unknown — observe current page
  await new Promise((resolve) => setTimeout(resolve, 500))
  if (step.targetHint) {
    await page
      .getByText(step.targetHint, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => undefined)
  } else if (step.target && !/^https?:\/\//i.test(step.target)) {
    await page
      .locator(step.target)
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => undefined)
  }
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

    if (seedUrl) {
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
        await executeStep(page, step, seedUrl)
        throwIfAborted()
        await new Promise((resolve) => setTimeout(resolve, 250))
        const frame = await captureFrame(page)
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

    if (seedUrl && timeLeft() > 3_000) {
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
        await executeStep(page, step, seedUrl)
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
