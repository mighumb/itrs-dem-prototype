/**
 * Hash / SPA tab activation during site explore — reveals CTAs hidden until
 * a section tab is selected (e.g. #use-cases on marketing pages).
 */

import type { Page } from 'playwright-core'
import { diacriticInsensitiveRegExp } from './playwrightRunner.js'

export type ExploreInventorySlice = {
  title: string
  heading: string | null
  links: Array<{ label: string; href: string }>
  buttons: string[]
  forms: Array<{ action: string | null; fields: string[] }>
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Human labels derived from a URL hash fragment (e.g. use-cases → "use cases"). */
export function fragmentLabelsFromHash(hash: string): string[] {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return []
  const decoded = decodeURIComponent(raw)
  const spaced = decoded.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim()
  const title =
    spaced.length > 0
      ? spaced.replace(/\b\w/g, (c) => c.toUpperCase())
      : decoded
  const lower = spaced.toLowerCase()
  return [...new Set([decoded, spaced, title, lower].filter((v) => v.length >= 2))]
}

export function destinationHasActivatableHash(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const hash = new URL(url).hash
    return Boolean(hash && hash.length > 1)
  } catch {
    return false
  }
}

/** Union explore inventories — keep the richest observed facts. */
export function mergeExploreInventories(
  base: ExploreInventorySlice,
  overlay: ExploreInventorySlice,
  limits?: { maxLinks?: number; maxButtons?: number },
): ExploreInventorySlice {
  const maxLinks = limits?.maxLinks ?? 18
  const maxButtons = limits?.maxButtons ?? 12

  const linkMap = new Map<string, { label: string; href: string }>()
  for (const link of [...base.links, ...overlay.links]) {
    const key = link.href || link.label
    if (!key) continue
    const prev = linkMap.get(key)
    if (!prev || link.label.length > prev.label.length) linkMap.set(key, link)
  }

  const buttons = [...new Set([...base.buttons, ...overlay.buttons])].slice(0, maxButtons)
  const forms =
    overlay.forms.reduce((n, f) => n + f.fields.length, 0) >
    base.forms.reduce((n, f) => n + f.fields.length, 0)
      ? overlay.forms
      : base.forms

  return {
    title: overlay.title || base.title,
    heading: overlay.heading || base.heading,
    links: Array.from(linkMap.values()).slice(0, maxLinks),
    buttons,
    forms: forms.length > 0 ? forms : base.forms.length > 0 ? base.forms : overlay.forms,
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

/**
 * Activate a URL hash / SPA tab so hidden section content enters the DOM.
 * Returns true when any activation strategy ran.
 */
export async function activatePageFragment(page: Page, destinationUrl: string): Promise<boolean> {
  let hash = ''
  try {
    hash = new URL(destinationUrl).hash
  } catch {
    return false
  }
  if (!hash || hash.length <= 1) return false

  const fragment = decodeURIComponent(hash.slice(1))
  const labels = fragmentLabelsFromHash(hash)
  let activated = false

  // Ensure the browser is on the hash URL (some SPAs only hydrate tabs then).
  if (!page.url().includes(hash)) {
    try {
      await page.goto(destinationUrl, { waitUntil: 'domcontentloaded', timeout: 12_000 })
      await page.waitForTimeout(350)
      activated = true
    } catch {
      // continue with click strategies on current page
    }
  }

  await scrollToUrlHash(page, destinationUrl)
  activated = true

  const encoded = encodeURIComponent(fragment)
  const selectorCandidates = [
    `a[href="${hash}"]`,
    `a[href="#${fragment}"]`,
    `a[href="#${encoded}"]`,
    `[role="tab"][aria-controls="${cssEscape(fragment)}"]`,
    `[role="tab"][aria-controls*="${cssEscape(fragment)}"]`,
    `[role="tab"][href="${hash}"]`,
    `[data-bs-target="${hash}"]`,
    `[data-bs-target="#${cssEscape(fragment)}"]`,
    `[data-target="${hash}"]`,
    `[data-tab="${cssEscape(fragment)}"]`,
    `[data-section="${cssEscape(fragment)}"]`,
  ]

  for (const selector of selectorCandidates) {
    const loc = page.locator(selector).first()
    if (!(await loc.isVisible({ timeout: 350 }).catch(() => false))) continue
    await loc.click({ timeout: 2500 }).catch(() => undefined)
    await page.waitForTimeout(450)
    return true
  }

  for (const label of labels) {
    const pattern = diacriticInsensitiveRegExp(label.slice(0, 48))
    for (const role of ['tab', 'button', 'link'] as const) {
      const loc = page.getByRole(role, { name: pattern }).first()
      if (!(await loc.isVisible({ timeout: 350 }).catch(() => false))) continue
      await loc.click({ timeout: 2500 }).catch(() => undefined)
      await page.waitForTimeout(450)
      return true
    }
  }

  return activated
}
