/**
 * Gemini API keys for Discovery failover.
 *
 * Configure in Vercel (Production + Preview):
 * - GEMINI_API_KEY          primary
 * - GEMINI_API_KEY_2         secondary (optional)
 * - GEMINI_API_KEY_3         … up to _5
 * - GEMINI_API_KEYS          optional comma/semicolon-separated list
 *
 * Quotas are usually per Google Cloud / AI Studio project. Keys from
 * different projects can keep Discovery alive when one free-tier key is spent.
 */
export function geminiApiKeys(): string[] {
  const keys: string[] = []

  const push = (value: string | undefined | null) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    if (!keys.includes(trimmed)) keys.push(trimmed)
  }

  push(process.env.GEMINI_API_KEY)
  for (let i = 2; i <= 5; i++) {
    push(process.env[`GEMINI_API_KEY_${i}`])
  }

  const list = process.env.GEMINI_API_KEYS ?? ''
  for (const part of list.split(/[,;\n]+/)) {
    push(part)
  }

  return keys
}
