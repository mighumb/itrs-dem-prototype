import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { analyzePublicSite, type SiteAnalysisResult } from './_lib/analyzeSite.js'
import { DISCOVERY_SYSTEM_PROMPT } from './_lib/discoverySystemPrompt.js'
import {
  resolveSiteTarget,
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
    pageSnapshot: analysis?.snapshot ?? body.context?.pageSnapshot ?? null,
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
  streamedStatuses: string[],
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
  }

  const merged = [...prefix, ...streamedStatuses, ...fromModel]
  const deduped: string[] = []
  for (const line of merged) {
    if (!deduped.includes(line)) deduped.push(line)
  }
  return deduped.length > 0 ? deduped.slice(0, 8) : null
}

function preferredLang(body: DiscoveryAiRequest): 'en' | 'fr' {
  return body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
}

function serverStatus(lang: 'en' | 'fr', key: 'resolve' | 'inspect'): string {
  const copy = {
    en: {
      resolve: 'Finding the official site…',
      inspect: 'Looking at the public page…',
    },
    fr: {
      resolve: 'Je cherche le site officiel…',
      inspect: 'Je regarde la page publique…',
    },
  }
  return copy[lang][key]
}

function writeNdjson(res: VercelResponse, event: Record<string, unknown>) {
  res.write(`${JSON.stringify(event)}\n`)
}

/**
 * Pull completed STATUS lines from a growing model buffer.
 */
function pullStatusLines(buffer: string): { statuses: string[]; rest: string } {
  const statuses: string[] = []
  let rest = buffer
  while (true) {
    const nl = rest.indexOf('\n')
    if (nl < 0) break
    const rawLine = rest.slice(0, nl)
    const next = rest.slice(nl + 1)
    const line = rawLine.trim()
    rest = next

    if (!line) continue

    const statusMatch = line.match(/^STATUS:\s*(.+)$/i)
    if (statusMatch?.[1]) {
      const text = statusMatch[1].trim()
      if (text) statuses.push(text)
      continue
    }

    if (/^RESULT\s*$/i.test(line)) {
      return { statuses, rest: `RESULT\n${rest}` }
    }

    return { statuses, rest: `${rawLine}\n${rest}` }
  }
  return { statuses, rest }
}

function parseModelOutput(fullText: string): {
  statuses: string[]
  parsed: Record<string, unknown>
} {
  const statuses: string[] = []
  const statusRe = /^STATUS:\s*(.+)$/gim
  let match: RegExpExecArray | null
  while ((match = statusRe.exec(fullText))) {
    const text = match[1]?.trim()
    if (text) statuses.push(text)
  }

  const resultIdx = fullText.search(/^RESULT\s*$/im)
  let jsonText = fullText
  if (resultIdx >= 0) {
    jsonText = fullText.slice(resultIdx).replace(/^RESULT\s*/i, '').trim()
  } else {
    jsonText = fullText.replace(/^STATUS:.*$/gim, '').trim()
  }

  return {
    statuses,
    parsed: extractJson(jsonText) as Record<string, unknown>,
  }
}

async function resolveAndAnalyzeWithStatus(
  body: DiscoveryAiRequest,
  apiKey: string,
  onStatus: (text: string) => void,
): Promise<{ analysis: SiteAnalysisResult | null; target: ResolvedSiteTarget | null }> {
  if (body.context?.pageSnapshot) {
    return { analysis: null, target: null }
  }

  if (!['bootstrap', 'chat', 'propose', 'configure', 'plan'].includes(body.mode)) {
    return { analysis: null, target: null }
  }

  const lang = preferredLang(body)
  const seedText = [body.userMessage, body.context?.seed].filter(Boolean).join(' — ')

  const existingUrl = body.context?.url
  const hasUrl =
    Boolean(existingUrl && /^https?:\/\//i.test(existingUrl)) ||
    /https?:\/\/[^\s]+/i.test(seedText) ||
    /\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}\b/i.test(seedText)

  if (!hasUrl) {
    onStatus(serverStatus(lang, 'resolve'))
  }

  const target = await resolveSiteTarget(seedText, {
    apiKey,
    existingUrl: body.context?.url,
  })

  if (!target.url) {
    return { target, analysis: null }
  }

  onStatus(serverStatus(lang, 'inspect'))
  const analysis = await analyzePublicSite(target.url)
  return { target, analysis }
}

function buildResultPayload(
  parsed: Record<string, unknown>,
  analysis: SiteAnalysisResult | null,
  target: ResolvedSiteTarget | null,
  body: DiscoveryAiRequest,
  modelName: string,
  streamedStatuses: string[],
) {
  return {
    type: 'result' as const,
    message: typeof parsed.message === 'string' ? parsed.message : 'Here is what I suggest.',
    workTrace: normalizeWorkTrace(parsed.workTrace, analysis, target, streamedStatuses),
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

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  const sendStatus = (text: string) => {
    writeNdjson(res, { type: 'status', text })
  }

  try {
    const { analysis, target } = await resolveAndAnalyzeWithStatus(body, apiKey, sendStatus)

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
          },
        })

        const streamedStatuses: string[] = []
        let buffer = ''
        const streamResult = await model.generateContentStream(
          buildUserPrompt(body, analysis, target),
        )

        for await (const chunk of streamResult.stream) {
          const piece = chunk.text()
          if (!piece) continue
          buffer += piece
          const pulled = pullStatusLines(buffer)
          buffer = pulled.rest
          for (const status of pulled.statuses) {
            streamedStatuses.push(status)
            sendStatus(status)
          }
        }

        const aggregatedResponse = await streamResult.response
        const fullText = aggregatedResponse.text()

        const { statuses, parsed } = parseModelOutput(fullText || buffer)
        for (const status of statuses) {
          if (!streamedStatuses.includes(status)) {
            streamedStatuses.push(status)
            sendStatus(status)
          }
        }

        writeNdjson(
          res,
          buildResultPayload(parsed, analysis, target, body, modelName, streamedStatuses),
        )
        return res.end()
      } catch (error) {
        lastError = error
        console.error(`[api/discovery] model ${modelName} failed`, error)
      }
    }

    const message = lastError instanceof Error ? lastError.message : 'Gemini request failed'
    writeNdjson(res, {
      type: 'error',
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
    return res.end()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed'
    console.error('[api/discovery]', message)
    if (!res.headersSent) {
      return res.status(502).json({ error: message })
    }
    writeNdjson(res, { type: 'error', error: message })
    return res.end()
  }
}
