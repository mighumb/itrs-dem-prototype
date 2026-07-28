import type { Browser, Frame, Locator, Page } from 'playwright-core'

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

const CONSENT_REFUSE_SELECTORS = [
  'button:has-text("Continuer sans accepter")',
  'button:has-text("Tout refuser")',
  'button:has-text("Refuser et fermer")',
  'button:has-text("Refuser")',
  'button:has-text("Reject all")',
  'button:has-text("Reject All")',
  'button:has-text("Reject")',
  'button:has-text("Deny")',
  'button:has-text("Decline")',
  '#didomi-notice-disagree-button',
  '#onetrust-reject-all-handler',
  '[aria-label*="Refuse" i]',
  '[aria-label*="Disagree" i]',
  '[aria-label*="Reject" i]',
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
  'button:has-text("Agree")',
  'button:has-text("Accepter")',
  'button:has-text("Accept")',
  'button:has-text("OK")',
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
    const loc = await findConsentButton(page, 'auto')
    if (!loc) return
    try {
      await loc.click({ timeout: 1500 })
      await page.waitForTimeout(350)
    } catch {
      // try again
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

/** True when a hint names a form field rather than the value to type. */
function looksLikeFieldName(hint: string): boolean {
  const h = hint.trim()
  if (!h || h.length > 60) return false
  if (/@/.test(h) || /\d{5,}/.test(h)) return false
  return /^(nom(\s+de\s+famille)?|pr[eé]nom|name|first\s*names?|last\s*names?|e-?mails?|mails?|t[eé]l[eé]phones?|phones?|mobiles?|portables?|adresses?|villes?|pays|companies|soci[eé]t[eé]s?|entreprises?|codes?\s*postaux?|zip|postal|subject|objet|message|comments?)$/i.test(
    h,
  )
}

function isSearchTypeStep(step: RunnableStep): boolean {
  if (/^search$/i.test(step.action.trim())) return true
  const blob = `${step.action} ${step.label}`
  if (/lancer\s+la\s+recherch|submit\s+(the\s+)?search/i.test(blob)) return false
  return /^(search|recherch)/i.test(step.label.trim()) || /\b(search\s+for|rechercher?\s+)/i.test(blob)
}

function isEmailFieldStep(step: RunnableStep): boolean {
  return /e-?mail|mail\b/i.test(`${step.label} ${step.targetHint ?? ''} ${step.target ?? ''}`)
}

function isPhoneFieldStep(step: RunnableStep): boolean {
  return /t[eé]l[eé]phone|phone|mobile|portable/i.test(
    `${step.label} ${step.targetHint ?? ''} ${step.target ?? ''}`,
  )
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
    /\b(?:dans|into|in|sur)\s+(?:le\s+|la\s+|l['’])?(?:champ\s+|field\s+)?["«]?([^"»]+?)["»]?\s*$/i,
  )
  if (dansChamp?.[1]) push(dansChamp[1])

  const fieldPatterns: Array<{ re: RegExp; names: string[] }> = [
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
  page: Page,
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
  if (step.target && !/^https?:\/\//i.test(step.target)) {
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
    extractQuotedText(step.label),
    // Map instructional “submit search” phrases to real button labels.
    isSearchSubmitClickLabel(step.label) ? 'Rechercher' : null,
    isSearchSubmitClickLabel(step.label) ? 'Search' : null,
    step.label
      .replace(/^(click|select|choose|open|choisis|sélectionne|ouvre|clique|cliquer)\s+/i, '')
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
    await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 35000 })
    // CMPs (Didomi…) often inject after first paint — wait then dismiss once.
    await page.waitForTimeout(700)
    await dismissNoise(page)
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
    const frame = await captureHighlighted(page, loc)
    // Submit via Enter only for Search-style steps. Plain Type (e.g. FR « Taper … »)
    // leaves submit to a following Click (« Rechercher ») so we don't skip that button.
    const shouldSubmitWithEnter =
      /^search$/i.test(step.action.trim()) ||
      /^(search|recherch)/i.test(step.label.trim())
    if (shouldSubmitWithEnter) {
      await page.keyboard.press('Enter')
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
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

    // Before submit / download CTAs, clear empty required selects (geo-gated brochure lists).
    if (/télécharge|download|brochure|submit|envoyer|valider|je\s+télécharge/i.test(step.label)) {
      await fillEmptyFormSelects(page)
    }

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
    // “Lancer la recherche” / Search submit with no visible button → Enter in focused field.
    if (isSearchSubmitClickLabel(step.label)) {
      const frame = await captureFrame(page)
      await page.keyboard.press('Enter')
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined)
      return frame
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

export type RunnerLocale = 'en' | 'fr'

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
 * phone country defaults, geo-gated fields, Accept-Language, etc.
 */
export async function createLocalizedPage(
  browser: Browser,
  options?: { preferredLanguage?: 'en' | 'fr' | null; seedUrl?: string | null },
): Promise<Page> {
  const lang = resolveRunnerLocale(options?.preferredLanguage, options?.seedUrl)
  const isFr = lang === 'fr'
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
 */
async function fillEmptyFormSelects(page: Page): Promise<void> {
  const selects = page.locator('form select, select:visible')
  const count = await selects.count().catch(() => 0)
  for (let i = 0; i < Math.min(count, 10); i++) {
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
        break
      }
    } catch {
      // continue
    }
  }
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
  preferredLanguage?: 'en' | 'fr' | null
  signal?: AbortSignal
  onEvent: (event: RunnerEvent) => void | Promise<void>
}): Promise<void> {
  const { steps, prompt, preferredLanguage, signal, onEvent } = options
  if (steps.length === 0) {
    await onEvent({ type: 'error', error: 'No steps to run' })
    return
  }

  const seedUrl = guessSeedUrl(steps, prompt)
  const runnerLocale = resolveRunnerLocale(preferredLanguage, seedUrl)
  let browser: Browser | null = null

  const throwIfAborted = () => {
    if (signal?.aborted) throw new Error('Aborted')
  }

  try {
    await onEvent({ type: 'status', text: 'Launching Playwright browser…' })
    browser = await launchBrowser()
    throwIfAborted()

    const page = await createLocalizedPage(browser, { preferredLanguage, seedUrl })

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
        const frame = await executeStepWithCapture(page, step, seedUrl, runnerLocale)
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
  preferredLanguage?: 'en' | 'fr' | null
  deadlineMs?: number
  onStatus?: (text: string) => void
}): Promise<DryRunResult> {
  const { steps, prompt, preferredLanguage, onStatus } = options
  const deadlineMs = options.deadlineMs ?? 18_000
  const started = Date.now()
  const timeLeft = () => deadlineMs - (Date.now() - started)

  if (steps.length === 0) {
    return { ok: false, stepsOk: 0, failedIndex: null, failedLabel: null, error: 'No steps' }
  }

  const seedUrl = guessSeedUrl(steps, prompt)
  const runnerLocale = resolveRunnerLocale(preferredLanguage, seedUrl)
  let browser: Browser | null = null

  try {
    onStatus?.('Rehearsing the journey in the browser…')
    browser = await launchBrowser()
    const page = await createLocalizedPage(browser, { preferredLanguage, seedUrl })

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
        await executeStepWithCapture(page, step, seedUrl, runnerLocale)
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
