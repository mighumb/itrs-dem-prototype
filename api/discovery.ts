import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type ChatTurn = { role: 'user' | 'agent'; content: string }

type DiscoveryAiRequest = {
  mode: 'bootstrap' | 'chat' | 'propose' | 'plan'
  userMessage: string
  history?: ChatTurn[]
  phase?: string
  context?: {
    seed?: string
    url?: string | null
    answers?: Record<string, string>
    selectedProposalId?: string | null
  }
}

const SYSTEM = `You are the Discovery assistant for ITRS DEM (Digital Experience Monitoring).
You help someone design a realistic browser journey to monitor (synthetic monitoring).

Who the user might be:
- A curious tester who does NOT work at the company and does not know the site
- An employee who thinks they know the critical path but may be wrong
Never assume they know "what is critical". Do not quiz them like an expert interview.

Be empathic, proactive, reassuring. Match the user's language (French or English).
Short paragraphs. **Bold** sparingly. Prefer concrete testable steps (open URL, search, click, fill, verify).

Your job is to LEAD with recommendations based on:
1) Industry / domain patterns (airline, hotel/OTA, retail/e-commerce, banking, telecom, SaaS, media, generic website)
2) Recurring journeys DEM teams always monitor for that sector
3) Likely fragile UX (search, login, checkout/booking, account recovery, payment step before card entry, etc.)

When you know the brand/site (e.g. Air France, Booking, Nike), briefly explain WHY these journeys matter for that sector, then propose options. Frame options as recommendations, not a test.
Example tone (FR): "Pas besoin de connaître le parcours critique — pour une compagnie aérienne, on commence souvent par la recherche + réservation. Voici 3 parcours que je te recommande."

Always reply with ONLY valid JSON:
{
  "message": string,
  "questions": [{ "id": string, "prompt": string, "options": string[3] }] | null,
  "proposals": [{ "id": string, "title": string, "description": string, "prompt": string }] | null,
  "plan": {
    "title": string,
    "summary": string,
    "steps": [{ "label": string, "action": string }],
    "prompt": string
  } | null,
  "readyForPlan": boolean
}

Phases:
1) Orient + recommend (bootstrap / early chat)
2) User picks a proposed journey (or asks to refine)
3) Only after they pick/validate → runnable plan

Rules by mode:
- bootstrap:
  - If the user names a site, brand, or sector: be proactive. Return message + exactly 3 recommended journey proposals tailored to that sector. questions MUST be null. plan null. readyForPlan false.
  - Mark the #1 recommendation clearly in the message and in the first proposal title/description (e.g. "Recommandé" / "Recommended").
  - Only if the ask is extremely vague (no site, no sector, no goal): return 1-2 soft, accessible questions with options that include a recommended default. Do NOT ask "what is the most critical part of the site?". Prefer: "On peut démarrer avec le parcours le plus courant pour ce secteur — ça te va ?"
  - Each proposal.prompt must be a full runnable paragraph (include URL/domain if known).
- propose: Return message + exactly 3 distinct recommended journeys. questions/plan null. readyForPlan false.
- plan: Final plan only after validation. message lists steps + plan object (4-8 steps). questions/proposals null. readyForPlan true.
- chat: Stay helpful and proactive. Prefer returning proposals over hard questions. Soft questions OK. Never readyForPlan/plan unless user explicitly validates a journey.

Sector cheat-sheet (use when relevant):
- Airline: flight search → results → outbound select → passenger details; manage booking; online check-in
- Hotel/OTA: destination search → results → property → room options
- Retail/e-commerce: search/PDP → size/add to bag → bag/checkout entry
- Banking: login → account overview; transfer initiation (stop before confirm)
- Generic: homepage availability; main conversion CTA; login/signup

plan.prompt = one paragraph for the runner (include URL if known).
plan.message = short intro + numbered steps.`

function buildUserPrompt(body: DiscoveryAiRequest): string {
  return JSON.stringify(
    {
      mode: body.mode,
      phase: body.phase ?? null,
      userMessage: body.userMessage,
      context: body.context ?? null,
      history: (body.history ?? []).slice(-16),
    },
    null,
    2,
  )
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('Model did not return JSON')
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' })
  }

  const body = (req.body ?? {}) as DiscoveryAiRequest
  if (!body.mode || typeof body.userMessage !== 'string') {
    return res.status(400).json({ error: 'mode and userMessage are required' })
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const modelCandidates = [
      process.env.GEMINI_MODEL,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-1.5-flash',
    ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index)

    let lastError: unknown
    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM,
          generationConfig: {
            temperature: 0.7,
            responseMimeType: 'application/json',
          },
        })

        const result = await model.generateContent(buildUserPrompt(body))
        const text = result.response.text()
        const parsed = extractJson(text) as Record<string, unknown>

        return res.status(200).json({
          message: typeof parsed.message === 'string' ? parsed.message : 'Here is what I suggest.',
          questions: Array.isArray(parsed.questions) ? parsed.questions : null,
          proposals: Array.isArray(parsed.proposals) ? parsed.proposals : null,
          plan: parsed.plan && typeof parsed.plan === 'object' ? parsed.plan : null,
          readyForPlan: Boolean(parsed.readyForPlan),
          model: modelName,
        })
      } catch (error) {
        lastError = error
        console.error(`[api/discovery] model ${modelName} failed`, error)
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Gemini request failed'
    return res.status(502).json({ error: message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed'
    console.error('[api/discovery]', message)
    return res.status(502).json({ error: message })
  }
}
