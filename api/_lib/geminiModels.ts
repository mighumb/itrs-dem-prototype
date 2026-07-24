import type { GeminiKeyTier } from './geminiKeys.js'

/**
 * Model candidates for Discovery.
 * Prototype cost control: all keys (free + GOOGLE_API_IP_LABEL) use Gemini 2.5 Flash.
 * `tier` is kept for call-site compatibility; both tiers share the same cheap Flash list.
 */
export function geminiModelCandidates(_tier: GeminiKeyTier = 'free'): string[] {
  return [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
}
