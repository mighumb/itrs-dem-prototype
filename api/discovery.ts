import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SiteAnalysisResult } from './_lib/analyzeSite.js'
import { DISCOVERY_SYSTEM_PROMPT } from './_lib/discoverySystemPrompt.js'
import {
  resolveAndAnalyzeSite,
  type ResolvedSiteTarget,
} from './_lib/resolveSiteTarget.js'

type ChatTurn = { role: 'user' | 'agent'; content: string }

type DiscoveryAiRequest = {
  mode: 'bootstrap' | 'chat' | 'propose' | 'configure' | 'plan'
  userMessage: string
  history?: ChatTurn[]
  phase?: string
  preferredLanguage?: 'en' | 'fr'
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
    pageSnapshot?: string | null
    preferredLanguage?: 'en' | 'fr'
  }
}

function buildUserPrompt(
  body: DiscoveryAiRequest,
  analysis: SiteAnalysisResult | null,
  target: ResolvedSiteTarget | null,
): string {
  const preferredLanguage =
    body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'

  const context = {
    ...(body.context ?? {}),
    preferredLanguage,
    url: analysis?.url ?? target?.url ?? body.context?.url ?? null,
    pageSnapshot:
      analysis?.snapshot ??
      body.context?.pageSnapshot ??
      null,
    siteTarget: target
      ? {
          url: target.url,
          source: target.source,
          label: target.label,
          note: target.note,
        }
      : null,
    siteAnalysis: analysis
      ? {
          ok: analysis.ok,
          url: analysis.url,
          reason: analysis.reason,
          title: analysis.title,
          status: analysis.status,
        }
      : null,
  }

  return JSON.stringify(
    {
      mode: body.mode,
      phase: body.phase ?? null,
      preferredLanguage,
      userMessage: body.userMessage,
      selectedProposal: body.selectedProposal ?? null,
      context,
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

function normalizeWorkTrace(
  raw: unknown,
  analysis: SiteAnalysisResult | null,
  target: ResolvedSiteTarget | null,
): string[] | null {
  const fromModel = Array.isArray(raw)
    ? raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((line) => line.trim())
    : []

  const prefix: string[] = []
  if (target?.note) prefix.push(target.note)
  if (analysis) {
    if (analysis.ok) {
      prefix.push(`Inspected ${analysis.url}${analysis.title ? ` — ${analysis.title}` : ''}`)
    } else {
      prefix.push(
        `Could not fully access ${analysis.url}${analysis.reason ? ` (${analysis.reason})` : ''}`,
      )
    }
  } else if (target?.source === 'none' && target.note) {
    // note already added
  }

  const merged = [...prefix, ...fromModel].slice(0, 6)
  return merged.length > 0 ? merged : null
}

async function maybeResolveAndAnalyze(
  body: DiscoveryAiRequest,
  apiKey: string,
): Promise<{ analysis: SiteAnalysisResult | null; target: ResolvedSiteTarget | null }> {
  if (body.context?.pageSnapshot) {
    return { analysis: null, target: null }
  }

  if (!['bootstrap', 'chat', 'propose', 'configure', 'plan'].includes(body.mode)) {
    return { analysis: null, target: null }
  }

  const seedText = [body.userMessage, body.context?.seed].filter(Boolean).join(' — ')
  const { target, analysis } = await resolveAndAnalyzeSite(seedText, {
    apiKey,
    existingUrl: body.context?.url,
    existingSnapshot: body.context?.pageSnapshot,
  })

  return { target, analysis }
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
    const { analysis, target } = await maybeResolveAndAnalyze(body, apiKey)

    const genAI = new GoogleGenerativeAI(apiKey)
    const modelCandidates = [
      process.env.GEMINI_MODEL,
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-flash-latest',
      'gemini-2.0-flash',
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

        const result = await model.generateContent(buildUserPrompt(body, analysis, target))
        const text = result.response.text()
        const parsed = extractJson(text) as Record<string, unknown>

        return res.status(200).json({
          message: typeof parsed.message === 'string' ? parsed.message : 'Here is what I suggest.',
          workTrace: normalizeWorkTrace(parsed.workTrace, analysis, target),
          questions: Array.isArray(parsed.questions) ? parsed.questions : null,
          proposals: Array.isArray(parsed.proposals) ? parsed.proposals : null,
          plan: parsed.plan && typeof parsed.plan === 'object' ? parsed.plan : null,
          readyForPlan: Boolean(parsed.readyForPlan),
          pageSnapshot: analysis?.snapshot ?? body.context?.pageSnapshot ?? null,
          siteTarget: target,
          siteAnalysis: analysis
            ? {
                ok: analysis.ok,
                url: analysis.url,
                reason: analysis.reason,
                title: analysis.title,
                status: analysis.status,
              }
            : null,
          model: modelName,
        })
      } catch (error) {
        lastError = error
        console.error(`[api/discovery] model ${modelName} failed`, error)
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Gemini request failed'
    return res.status(502).json({
      error: message,
      siteTarget: target,
      siteAnalysis: analysis
        ? {
            ok: analysis.ok,
            url: analysis.url,
            reason: analysis.reason,
            title: analysis.title,
            status: analysis.status,
          }
        : null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed'
    console.error('[api/discovery]', message)
    return res.status(502).json({ error: message })
  }
}
