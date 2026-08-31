import { geminiApiKeys, type GeminiKeyTier } from './geminiKeys.js'
import { geminiApiKeysForRequest } from './geminiFailover.js'

export type GeminiKeyRosterEntry = {
  label: string
  tier: GeminiKeyTier
}

/** Non-secret Gemini key roster for ops / health checks. */
export function geminiKeyRosterSnapshot() {
  const configured = geminiApiKeys()
  const forRequest = geminiApiKeysForRequest()

  const keys: GeminiKeyRosterEntry[] = configured.map(({ label, tier }) => ({
    label,
    tier,
  }))
  const requestOrder: GeminiKeyRosterEntry[] = forRequest.map(({ label, tier }) => ({
    label,
    tier,
  }))

  const freeCount = configured.filter((entry) => entry.tier === 'free').length
  const paidCount = configured.filter((entry) => entry.tier === 'paid').length

  return {
    ok: configured.length > 0,
    keys,
    requestOrder,
    freeCount,
    paidCount,
    failoverReady: freeCount > 0 && paidCount > 0,
  }
}
