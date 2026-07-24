/**
 * Gemini API keys for Discovery failover.
 *
 * Priority (each request starts from the top again after reset / success):
 * 1. GEMINI_API_KEY          free-tier primary
 * 2. GEMINI_API_KEY_2…_5      free-tier failovers
 * 3. GEMINI_API_KEYS          optional extra free-tier list
 * 4. GOOGLE_API_IP_LABEL      billed last-resort key (only after free keys fail)
 *
 * Quotas are usually per Google Cloud / AI Studio project. Prefer free keys
 * from different projects so failover actually increases capacity.
 */
export function geminiApiKeys(): string[] {
  const keys: string[] = []

  const push = (value: string | undefined | null) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    if (!keys.includes(trimmed)) keys.push(trimmed)
  }

  // Free-tier keys first.
  push(process.env.GEMINI_API_KEY)
  for (let i = 2; i <= 5; i++) {
    push(process.env[`GEMINI_API_KEY_${i}`])
  }

  const list = process.env.GEMINI_API_KEYS ?? ''
  for (const part of list.split(/[,;\n]+/)) {
    push(part)
  }

  // Billed / IP-Label key last — only when free-tier keys are exhausted.
  push(process.env.GOOGLE_API_IP_LABEL)

  return keys
}
