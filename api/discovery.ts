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

Tone: concise, professional, helpful. Use short paragraphs. You may use **bold** sparingly.
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

Rules by mode:
- bootstrap: user gave a vague goal/URL. Return message + 2-4 clarifying questions (each with exactly 3 options). proposals/plan null. readyForPlan false.
- propose: user answered questions. Return message + exactly 3 journey proposals (distinct paths). Each proposal.prompt must be a full journey description the system can run. questions/plan null.
- plan: build a concrete monitoring plan (4-8 steps). Return message + plan. questions/proposals null. readyForPlan true.
- chat: continue the conversation. If you have enough site+goal detail, set readyForPlan true and include plan. Otherwise ask for what's missing. questions/proposals usually null.

plan.prompt must be a single paragraph the monitoring runner can interpret (include URL if known).`

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
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
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
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed'
    console.error('[api/discovery]', message)
    return res.status(502).json({ error: message })
  }
}
