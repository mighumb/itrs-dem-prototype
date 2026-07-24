import type { GeminiKeyTier } from './geminiKeys.js'

/**
 * Model candidates by key tier.
 * - free: stay on Gemini 2.5 Flash (no legacy 1.5 / Flash-8B)
 * - paid (GOOGLE_API_IP_LABEL): prefer the strongest available model first
 */
export function geminiModelCandidates(tier: GeminiKeyTier = 'free'): string[] {
  if (tier === 'paid') {
    return [
      process.env.GEMINI_PAID_MODEL,
      // Strongest widely available thinking model on Google AI Studio.
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.0-flash',
    ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
  }

  return [
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
}
