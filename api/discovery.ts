import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type ChatTurn = { role: 'user' | 'agent'; content: string }

type DiscoveryAiRequest = {
  mode: 'bootstrap' | 'chat' | 'propose' | 'configure' | 'plan'
  userMessage: string
  history?: ChatTurn[]
  phase?: string
  selectedProposal?: {
    id?: string
    title?: string
    description?: string
    prompt?: string
  } | null
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

Be calm, professional, and precise. Match the user's language (French or English).
No hype, no cheerleading, no exclamations like "Excellent !", "Parfait !", "Super !".
Prefer concrete testable steps (open URL, search, click, fill, verify).

Your job is to LEAD with recommendations based on:
1) Industry / domain patterns (airline, hotel/OTA, retail/e-commerce, banking, telecom, SaaS, media, generic website)
2) Recurring journeys DEM teams always monitor for that sector
3) Likely fragile UX (search, login, checkout/booking, account recovery, payment step before card entry, etc.)

When you know the brand/site (e.g. Air France, Booking, Nike), briefly explain WHY these journeys matter for that sector, then propose options. Frame options as recommendations, not a test.
Example tone (FR): "Pour une compagnie de transport, les équipes DEM commencent souvent par la recherche et la réservation. Voici trois parcours adaptés — le premier est recommandé."

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

Phases (never skip):
1) Orient + recommend journey TYPES for the sector/site
2) User picks a journey type
3) Collect concrete parameters WITH the user (origin, destination, dates, product, city, login path, etc.) — never invent them
4) Only then build the runnable plan → Ready to Run

Rules by mode:
- bootstrap:
  - If the user names a site, brand, or sector: return message + exactly 3 recommended journey-type proposals. questions MUST be null. plan null. readyForPlan false.
  - Mark #1 as recommended. Each proposal describes the TYPE of journey, not a fully filled scenario (no invented cities/dates/products).
  - proposal.prompt = high-level intent only (site + journey type), without fabricating specific form values.
  - If extremely vague: 1-2 soft questions. Never ask "what is most critical?".
- propose: 3 journey-type proposals. questions/plan null. readyForPlan false.
- configure: The user just chose a journey type (see selectedProposal). Return message + 2-5 short parameter questions so the journey can succeed (each with exactly 3 accessible options, including a sensible suggested default labeled "Suggéré"/"Suggested").
  - Examples by sector: train/airline → from, to, when; hotel → city, dates; retail → product/search term; login → which account area.
  - Do NOT return a plan yet. proposals null. readyForPlan false.
  - Never invent Paris→Lyon, Barcelona, specific SKUs, etc. without asking — options are suggestions the user can pick or override.
- plan: ONLY after parameter answers exist in context.answers (or userMessage). Build plan using THOSE values. message lists steps + plan object (4-8 steps). questions/proposals null. readyForPlan true.
- chat: Prefer proposals or configure questions. Never readyForPlan/plan unless parameters were collected and user validates.

Sector cheat-sheet (journey TYPES only until configure):
- Airline: flight search/select; manage booking; online check-in
- Train: search & select trip; manage booking
- Hotel/OTA: destination search → property → rooms
- Retail: search/PDP → add to bag; checkout entry
- Banking: login → overview; transfer start (stop before confirm)
- Generic: homepage; main CTA; login/signup

plan.prompt = one paragraph including the user-chosen parameters and URL if known.
plan.message = short intro + numbered steps.`

function buildUserPrompt(body: DiscoveryAiRequest): string {
  return JSON.stringify(
    {
      mode: body.mode,
      phase: body.phase ?? null,
      userMessage: body.userMessage,
      selectedProposal: body.selectedProposal ?? null,
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
