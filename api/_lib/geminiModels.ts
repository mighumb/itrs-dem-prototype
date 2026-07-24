/**
 * Ordered Gemini model candidates for Discovery.
 * Free-tier quotas are per-model — prefer Flash-8B when heavier Flash models are exhausted.
 */
export function geminiModelCandidates(): string[] {
  return [
    // Prefer 8B first on free tier — heavier Flash models often hit RPD first.
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-8b-latest',
    process.env.GEMINI_MODEL,
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-flash-latest',
    'gemini-2.0-flash',
  ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)
}
