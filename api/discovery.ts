import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { DISCOVERY_SYSTEM_PROMPT } from './discoverySystemPrompt'

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
    /** Optional live page evidence (future site analysis). */
    pageSnapshot?: string | null
  }
}

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

function normalizeWorkTrace(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const lines = raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((line) => line.trim())
    .slice(0, 5)
  return lines.length > 0 ? lines : null
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
          systemInstruction: DISCOVERY_SYSTEM_PROMPT,
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
          workTrace: normalizeWorkTrace(parsed.workTrace),
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
