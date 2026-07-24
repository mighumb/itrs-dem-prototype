/**
 * Ordered Gemini model candidates for Discovery.
 * Free-tier quotas are per-model — prefer Flash-8B when heavier Flash models are exhausted.
 */
export function geminiModelCandidates(): string[] {
  return [
    process.env.GEMINI_MODEL,
    // Still often has free-tier headroom when 1.5/2.x Flash RPD is spent.
    'gemini-1.5-flash-8b',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
}
