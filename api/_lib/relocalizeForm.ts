/**
 * Dedicated translate-only path for Discovery floating forms.
 * Not the full Discovery agent — no site resolve, explore, or journey invent.
 */

export type RelocalizeProposal = {
  id?: string
  title?: string
  description?: string
  prompt?: string
}

export type RelocalizeQuestion = {
  id?: string
  prompt?: string
  options?: string[]
}

export type RelocalizeSource = {
  proposals?: RelocalizeProposal[] | null
  questions?: RelocalizeQuestion[] | null
  targetLanguage?: string
}

export const RELOCALIZE_SYSTEM_PROMPT = `You are a UI string translator for a monitoring product floating form.

Task: translate the provided proposals and/or questions into the target language.
- Keep the SAME ids, the SAME count, and the SAME meaning/intent.
- Do NOT invent new journeys, options, or questions.
- Do NOT drop or reorder items.
- Translate only human-visible fields: title, description, prompt, options, formTitle, message.
- message: one short sentence in the target language (e.g. that the form was updated) — do not re-list items.
- plan must be null. readyForPlan must be false. workTrace must be null or [].

Return ONLY valid JSON:
{
  "message": string,
  "formTitle": string | null,
  "questions": array | null,
  "proposals": array | null,
  "plan": null,
  "readyForPlan": false,
  "workTrace": null
}`

export function parseRelocalizeSource(userMessage: string): RelocalizeSource {
  try {
    const parsed = JSON.parse(userMessage) as RelocalizeSource
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Pin translated copy onto the original items so ids/count/order cannot drift.
 */
export function mergeRelocalizedForm(
  source: RelocalizeSource,
  parsed: Record<string, unknown>,
  lang: 'en' | 'fr',
): Record<string, unknown> {
  const fr = lang === 'fr'
  const srcProposals = Array.isArray(source.proposals) ? source.proposals : null
  const srcQuestions = Array.isArray(source.questions) ? source.questions : null
  const outProposals = Array.isArray(parsed.proposals) ? parsed.proposals : null
  const outQuestions = Array.isArray(parsed.questions) ? parsed.questions : null

  let proposals: RelocalizeProposal[] | null = null
  if (srcProposals && srcProposals.length > 0) {
    proposals = srcProposals.map((src, index) => {
      const raw = (outProposals?.[index] ?? null) as RelocalizeProposal | null
      return {
        id: src.id,
        title: asString(raw?.title, src.title ?? '').trim() || src.title || '',
        description:
          asString(raw?.description, src.description ?? '').trim() || src.description || '',
        prompt: asString(raw?.prompt, src.prompt ?? '').trim() || src.prompt || '',
      }
    })
  }

  let questions: RelocalizeQuestion[] | null = null
  if (srcQuestions && srcQuestions.length > 0) {
    questions = srcQuestions.map((src, index) => {
      const raw = (outQuestions?.[index] ?? null) as RelocalizeQuestion | null
      const srcOptions = Array.isArray(src.options) ? src.options : []
      const rawOptions = Array.isArray(raw?.options) ? raw.options : []
      return {
        id: src.id,
        prompt: asString(raw?.prompt, src.prompt ?? '').trim() || src.prompt || '',
        options: srcOptions.map((opt, i) => {
          const translated = rawOptions[i]
          return typeof translated === 'string' && translated.trim()
            ? translated.trim()
            : opt
        }),
      }
    })
  }

  const formTitle =
    typeof parsed.formTitle === 'string' && parsed.formTitle.trim()
      ? parsed.formTitle.trim().slice(0, 80)
      : proposals
        ? fr
          ? 'Choisir un parcours'
          : 'Choose a journey'
        : fr
          ? 'Préciser votre demande'
          : 'Clarify your request'

  const message =
    typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : fr
        ? 'Formulaire mis à jour.'
        : 'Form updated.'

  return {
    message,
    formTitle,
    questions,
    proposals,
    plan: null,
    readyForPlan: false,
    workTrace: null,
  }
}

export function buildRelocalizeUserPrompt(
  source: RelocalizeSource,
  preferredLanguage: 'en' | 'fr',
): string {
  return JSON.stringify(
    {
      task: 'relocalize_ui',
      preferredLanguage,
      translateProposals: source.proposals ?? null,
      translateQuestions: source.questions ?? null,
      rules: [
        'Same ids and count',
        'Translate visible strings only',
        'Do not invent journeys or options',
      ],
    },
    null,
    2,
  )
}
