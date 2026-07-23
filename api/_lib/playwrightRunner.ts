import { chromium, type Browser, type Page } from 'playwright'

export type RunnableStep = {
  id: string
  label: string
  action: string
  target?: string
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
  | { type: 'step_done'; index: number; id: string }
  | {
      type: 'step_failed'
      index: number
      id: string
      label: string
      error: string
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

async function dismissNoise(page: Page) {
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
    step.label
      .replace(/^(click|select|choose|open|choisis|sélectionne|ouvre)\s+/i, '')
      .split(/\s+and\b/i)[0]
      ?.trim(),
    step.label.match(/"([^"]+)"/)?.[1],
    step.label.match(/«\s*([^»]+)\s*»/)?.[1],
  ].filter((v): v is string => Boolean(v && v.length > 1 && v.length < 60))

  for (const hint of textHints) {
    try {
      const loc = page.getByRole('button', { name: new RegExp(hint.slice(0, 32), 'i') }).first()
      if (await loc.isVisible({ timeout: 700 })) {
        await loc.click({ timeout: 4000 })
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
        return
      }
    } catch {
      // continue
    }
    try {
      const loc = page.getByRole('link', { name: new RegExp(hint.slice(0, 32), 'i') }).first()
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
  const url = extractUrl(step.target) || extractUrl(step.label) || null

  if (
    action === 'navigate' ||
    Boolean(url) ||
    /navigate|go to|open url|va sur|ouvre https?/i.test(blob)
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

  if (action === 'click' || /click|select|choose|choisis|sélectionne|ouvre/i.test(blob)) {
    await clickFromStep(page, step)
    await dismissNoise(page)
    return
  }

  // Verify / wait / unknown — observe current page
  await page.waitForTimeout(700)
  if (step.target && !/^https?:\/\//i.test(step.target)) {
    await page
      .locator(step.target)
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => undefined)
  }
}

async function launchBrowser(): Promise<Browser> {
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

      try {
        await executeStep(page, step, seedUrl)
        throwIfAborted()
        await page.waitForTimeout(350)
        const frame = await captureFrame(page)
        await onEvent({
          type: 'step_frame',
          index: i,
          id: step.id,
          label: step.label,
          ...frame,
        })
        await onEvent({ type: 'step_done', index: i, id: step.id })
      } catch (error) {
        ok = false
        const message = error instanceof Error ? error.message : 'Step failed'
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
