export type GeminiKeyTier = 'free' | 'paid'

export type GeminiApiKey = {
  key: string
  /** free = GEMINI_API_KEY / _2… ; paid = GOOGLE_API_IP_LABEL last resort */
  tier: GeminiKeyTier
  /** 1-based label for logs (never log the secret itself) */
  label: string
}

/**
 * Gemini API keys for Discovery failover.
 *
 * Priority (each request starts from the top again after reset / success):
 * 1. GEMINI_API_KEY          free-tier primary
 * 2. GEMINI_API_KEY_2…_5      free-tier failovers
 * 3. GEMINI_API_KEYS          optional extra free-tier list
 * 4. GOOGLE_API_IP_LABEL      billed last-resort key (only after free keys fail)
 */
export function geminiApiKeys(): GeminiApiKey[] {
  const entries: GeminiApiKey[] = []

  const push = (
    value: string | undefined | null,
    tier: GeminiKeyTier,
    label: string,
  ) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    if (entries.some((entry) => entry.key === trimmed)) return
    entries.push({ key: trimmed, tier, label })
  }

  push(process.env.GEMINI_API_KEY, 'free', 'GEMINI_API_KEY')
  for (let i = 2; i <= 5; i++) {
    push(process.env[`GEMINI_API_KEY_${i}`], 'free', `GEMINI_API_KEY_${i}`)
  }

  const list = process.env.GEMINI_API_KEYS ?? ''
  let listIndex = 0
  for (const part of list.split(/[,;\n]+/)) {
    listIndex += 1
    push(part, 'free', `GEMINI_API_KEYS#${listIndex}`)
  }

  push(process.env.GOOGLE_API_IP_LABEL, 'paid', 'GOOGLE_API_IP_LABEL')

  return entries
}
