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
Help a business user design a realistic browser journey to monitor (synthetic monitoring).

Tone: concise, professional, helpful. Match the user's language (French or English).
Use short paragraphs. You may use **bold** sparingly.
Never invent company secrets. Prefer concrete, testable steps (open URL, search, click, fill, verify).

Always reply with ONLY valid JSON matching this shape:
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

Discovery phases (strict — do not skip ahead):
1) Clarify need with questions
2) Propose 3 journey options
3) Only after the user picks/validates one → build the runnable plan

Rules by mode:
- bootstrap: ALWAYS clarify first. Return message + 2-4 clarifying questions (each with exactly 3 options). proposals MUST be null. plan MUST be null. readyForPlan MUST be false. Even if the user names a site (e.g. booking.com), ask what to monitor.
- propose: Return message + exactly 3 distinct journey proposals. questions/plan null. readyForPlan false.
- plan: Only when explicitly asked to build the final plan. Return message that lists the steps clearly + plan object (4-8 steps). questions/proposals null. readyForPlan true.
- chat: Continue brainstorming. Prefer asking a follow-up OR returning questions. Do NOT set readyForPlan true and do NOT return a plan unless the user explicitly asks to finalize/validate a chosen journey. proposals may be returned if they ask for options.

plan.prompt must be a single paragraph the monitoring runner can interpret (include URL if known).
In plan.message, include a short intro AND a numbered list of the steps.`

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
