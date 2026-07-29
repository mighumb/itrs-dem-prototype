import { geminiApiKeys, type GeminiApiKey } from './geminiKeys.js'

/** After a free-tier daily/project hard quota, skip free keys for a short window. */
let freeTierCooldownUntilMs = 0

export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\b429\b|Too Many Requests|quota|rate.?limit/i.test(message)
}

/** Daily/project free-tier caps — retrying the same free key/models wastes the request. */
export function isFreeTierHardQuota(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /generate_content_free_tier/i.test(message) ||
    /FreeTier/i.test(message) ||
    /GenerateRequestsPerDayPerProjectPerModel/i.test(message) ||
    /limit:\s*0\b/i.test(message)
  )
}

export function isHardQuotaExhausted(error: unknown): boolean {
  return isFreeTierHardQuota(error)
}

export function retryDelayMs(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/retry in ([\d.]+)\s*s/i)
  if (!match) return 1500
  return Math.min(8000, Math.max(500, Math.ceil(parseFloat(match[1]) * 1000)))
}

export function markFreeTierExhausted(error?: unknown): void {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const match = message.match(/retry in ([\d.]+)\s*s/i)
  const fromError = match ? Math.ceil(parseFloat(match[1]) * 1000) : 60_000
  // Keep cooldown long enough to absorb the daily FreeTier wall, but not forever in-process.
  const ms = Math.min(15 * 60_000, Math.max(60_000, fromError))
  freeTierCooldownUntilMs = Math.max(freeTierCooldownUntilMs, Date.now() + ms)
}

/**
 * Ordered keys for this request.
 * When free-tier hard quota was just hit in this instance, start on the paid key.
 */
export function geminiApiKeysForRequest(): GeminiApiKey[] {
  const all = geminiApiKeys()
  const paid = all.filter((entry) => entry.tier === 'paid')
  const free = all.filter((entry) => entry.tier === 'free')

  if (paid.length === 0) {
    console.warn(
      '[geminiKeys] no paid key loaded (set GOOGLE_API_IP_LABEL on Vercel for Preview + Production)',
    )
    return all
  }

  if (Date.now() < freeTierCooldownUntilMs) {
    console.info(
      `[geminiKeys] free-tier cooldown active — preferring paid first (${paid.map((e) => e.label).join(', ')})`,
    )
    return [...paid, ...free]
  }

  return all
}

export function logGeminiKeyRoster(entries: GeminiApiKey[], scope = 'discovery'): void {
  const roster =
    entries.length === 0
      ? '(none)'
      : entries.map((entry) => `${entry.label}/${entry.tier}`).join(', ')
  console.info(`[api/${scope}] Gemini key roster: ${roster}`)
}
