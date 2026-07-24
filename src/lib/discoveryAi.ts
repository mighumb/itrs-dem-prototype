import {
  agentNeedsMoreContextMessage,
  buildConfigureQuestions,
  buildDiscoveryQuestions,
  buildJourneyProposals,
  buildPlanFromPrompt,
  createDiscoveryContext,
  formatPlanMessage,
  type DiscoveryContext,
  type DiscoveryPlan,
  type DiscoveryQuestion,
  type JourneyProposal,
} from '../mock/discovery'
import type { ChatMessage } from '../types'

export type DiscoveryAiMode = 'bootstrap' | 'chat' | 'propose' | 'configure' | 'plan'

export type SiteAnalysisInfo = {
  ok: boolean
  url: string
  reason: string | null
  title: string | null
  status: number | null
}

export interface DiscoveryAiResult {
  message: string
  workTrace: string[] | null
  questions: DiscoveryQuestion[] | null
  proposals: JourneyProposal[] | null
  plan: DiscoveryPlan | null
  readyForPlan: boolean
  siteAnalysis: SiteAnalysisInfo | null
  pageSnapshot: string | null
  source: 'gemini' | 'mock'
  model: string | null
  aborted?: boolean
}

function historyFromMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

function normalizeQuestions(raw: unknown): DiscoveryQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const next = raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const q = item as Record<string, unknown>
      const options = Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === 'string').slice(0, 3)
      : []
      if (typeof q.prompt !== 'string' || options.length < 2) return null
      return {
        id: typeof q.id === 'string' ? q.id : `q-${index + 1}`,
        prompt: q.prompt,
        options,
      }
    })
    .filter((q): q is DiscoveryQuestion => Boolean(q))
  return next.length > 0 ? next : null
}

function normalizeProposals(raw: unknown): JourneyProposal[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const next = raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const p = item as Record<string, unknown>
      if (
        typeof p.title !== 'string' ||
        typeof p.description !== 'string' ||
        typeof p.prompt !== 'string'
      ) {
        return null
      }
      return {
        id: typeof p.id === 'string' ? p.id : `proposal-${index + 1}`,
        title: p.title,
        description: p.description,
        prompt: p.prompt,
      }
    })
    .filter((p): p is JourneyProposal => Boolean(p))
  return next.length > 0 ? next.slice(0, 3) : null
}

function normalizePlan(raw: unknown, fallbackPrompt: string): DiscoveryPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const steps = Array.isArray(p.steps)
    ? p.steps
        .map((step) => {
          if (!step || typeof step !== 'object') return null
          const s = step as Record<string, unknown>
          if (typeof s.label !== 'string' || typeof s.action !== 'string') return null
          return { label: s.label, action: s.action }
        })
        .filter((s): s is { label: string; action: string } => Boolean(s))
    : []
  if (typeof p.title !== 'string' || typeof p.summary !== 'string' || steps.length === 0) {
    return null
  }
  return {
    title: p.title,
    summary: p.summary,
    steps,
    prompt: typeof p.prompt === 'string' && p.prompt.trim() ? p.prompt : fallbackPrompt,
  }
}

function normalizeWorkTrace(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const lines = raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((line) => line.trim())
    .slice(0, 6)
  return lines.length > 0 ? lines : null
}

function normalizeSiteAnalysis(raw: unknown): SiteAnalysisInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (typeof a.url !== 'string') return null
  return {
    ok: Boolean(a.ok),
    url: a.url,
    reason: typeof a.reason === 'string' ? a.reason : null,
    title: typeof a.title === 'string' ? a.title : null,
    status: typeof a.status === 'number' ? a.status : null,
  }
}

function mockFallback(
  mode: DiscoveryAiMode,
  userMessage: string,
  ctx: DiscoveryContext | null,
  preferredLanguage: 'en' | 'fr' = 'en',
): DiscoveryAiResult {
  const lang = preferredLanguage
  if (mode === 'bootstrap') {
    const nextCtx = ctx ?? createDiscoveryContext(userMessage)
    const hasTarget = Boolean(nextCtx.url) || /[a-z0-9-]+\.[a-z]{2,}/i.test(nextCtx.seed)
    if (hasTarget) {
      return {
        message:
          lang === 'fr'
            ? 'Mode hors ligne — voici **3 options de parcours** pour cette cible. **#1 est recommandé**. Choisis dans le panneau, ou dis-moi quoi changer.'
            : "Offline fallback — here are **3 journey options** for that target. **#1 is recommended**. Pick one in the panel, or tell me what to change.",
        workTrace:
          lang === 'fr'
            ? [
                'API indisponible — repli hors ligne',
                'Pas de snapshot live dans ce repli',
                'Rédaction de 3 options de parcours',
              ]
            : [
                'API unavailable — offline fallback',
                'No live snapshot in this fallback',
                'Drafting 3 journey options',
              ],
        questions: null,
        proposals: buildJourneyProposals(nextCtx, lang),
        plan: null,
        readyForPlan: false,
        siteAnalysis: null,
        pageSnapshot: null,
        source: 'mock',
        model: null,
      }
    }
    return {
      message:
        lang === 'fr'
          ? 'Je peux t’aider à concevoir un parcours de monitoring — sans connaissance préalable. Quelques choix rapides et je te propose des options solides.'
          : "I can help design a monitoring journey — no prior knowledge needed. A few quick choices and I'll recommend solid options.",
      workTrace:
        lang === 'fr'
          ? ['Entrée ouverte', 'Besoin d’un peu plus de signal']
          : ['Entry is open-ended', 'Need a bit more signal'],
      questions: buildDiscoveryQuestions(nextCtx, lang),
      proposals: null,
      plan: null,
      readyForPlan: false,
      siteAnalysis: null,
      pageSnapshot: null,
      source: 'mock',
      model: null,
    }
  }

  if (mode === 'propose' && ctx) {
    return {
      message:
        lang === 'fr'
          ? 'Voici **3 options de parcours** — **#1 est recommandé**. Choisis dans le panneau, utilise **Autre**, ou précise dans le chat.'
          : 'Here are **3 journey options** — **#1 is recommended**. Pick one in the panel, use **Other**, or refine in chat.',
      workTrace:
        lang === 'fr'
          ? ['Synthèse des réponses', 'Proposition de 3 parcours prioritaires']
          : ['Synthesizing answers', 'Proposing 3 prioritized journeys'],
      questions: null,
      proposals: buildJourneyProposals(ctx, lang),
      plan: null,
      readyForPlan: false,
      siteAnalysis: null,
      pageSnapshot: null,
      source: 'mock',
      model: null,
    }
  }

  if (mode === 'configure' && ctx?.selectedProposal) {
    return {
      message:
        lang === 'fr'
          ? 'Avant de figer les étapes, réglons ensemble les paramètres du parcours. Tu peux aussi préciser dans le chat.'
          : "Before locking the steps, let's set the journey parameters together. You can also clarify in chat.",
      workTrace:
        lang === 'fr'
          ? ['Type de parcours sélectionné', 'Collecte des paramètres']
          : ['Journey type selected', 'Collecting parameters'],
      questions: buildConfigureQuestions(ctx, ctx.selectedProposal, lang),
      proposals: null,
      plan: null,
      readyForPlan: false,
      siteAnalysis: null,
      pageSnapshot: null,
      source: 'mock',
      model: null,
    }
  }

  if (mode === 'plan') {
    const detail = ctx
      ? Object.entries(ctx.answers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ')
      : ''
    const plan = buildPlanFromPrompt(
      [ctx?.selectedProposal?.prompt, detail, userMessage, ctx?.seed]
        .filter(Boolean)
        .join(' — ') || userMessage,
    )
    return {
      message: formatPlanMessage(plan),
      workTrace:
        lang === 'fr'
          ? ['Paramètres rassemblés', 'Construction du plan exécutable']
          : ['Parameters gathered', 'Building runnable plan'],
      questions: null,
      proposals: null,
      plan,
      readyForPlan: true,
      siteAnalysis: null,
      pageSnapshot: null,
      source: 'mock',
      model: null,
    }
  }

  return {
    message: agentNeedsMoreContextMessage(userMessage, lang),
    workTrace: null,
    questions: null,
    proposals: null,
    plan: null,
    readyForPlan: false,
    siteAnalysis: null,
    pageSnapshot: null,
    source: 'mock',
    model: null,
  }
}

export function looksLikeHttpUrl(text: string): boolean {
  return /https?:\/\/[^\s]+/i.test(text) || /\b[a-z0-9-]+\.[a-z]{2,}(?:\/|\b)/i.test(text)
}

export async function requestDiscoveryAi(options: {
  mode: DiscoveryAiMode
  userMessage: string
  messages?: ChatMessage[]
  phase?: string
  context?: DiscoveryContext | null
  selectedProposal?: JourneyProposal | null
  preferredLanguage?: 'en' | 'fr'
  signal?: AbortSignal
  onStatus?: (text: string) => void
}): Promise<DiscoveryAiResult> {
  const {
    mode,
    userMessage,
    messages = [],
    phase,
    context,
    selectedProposal,
    preferredLanguage = 'en',
    signal,
    onStatus,
  } = options

  const abortedResult = (): DiscoveryAiResult => ({
    message: '',
    workTrace: null,
    questions: null,
    proposals: null,
    plan: null,
    readyForPlan: false,
    siteAnalysis: null,
    pageSnapshot: null,
    source: 'mock',
    model: null,
    aborted: true,
  })

  try {
    const response = await fetch('/api/discovery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
        'X-Discovery-Stream': '1',
      },
      signal,
      body: JSON.stringify({
        mode,
        userMessage,
        phase,
        preferredLanguage,
        history: historyFromMessages(messages),
        selectedProposal: selectedProposal
          ? {
              id: selectedProposal.id,
              title: selectedProposal.title,
              description: selectedProposal.description,
              prompt: selectedProposal.prompt,
            }
          : context?.selectedProposal
            ? {
                id: context.selectedProposal.id,
                title: context.selectedProposal.title,
                description: context.selectedProposal.description,
                prompt: context.selectedProposal.prompt,
              }
            : null,
        context: context
          ? {
              seed: context.seed,
              url: context.url,
              answers: context.answers,
              selectedProposalId: context.selectedProposalId,
              pageSnapshot: context.pageSnapshot ?? null,
              preferredLanguage,
            }
          : { preferredLanguage },
      }),
    })

    if (signal?.aborted) return abortedResult()

    if (!response.ok) {
      throw new Error(`API ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const fallbackPrompt =
      userMessage || context?.seed || 'Monitor critical user journey'

    // NDJSON stream (live status + final result)
    if (contentType.includes('ndjson') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let resultData: Record<string, unknown> | null = null
      let streamError: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let event: Record<string, unknown>
          try {
            event = JSON.parse(trimmed) as Record<string, unknown>
          } catch {
            continue
          }
          if (event.type === 'status' && typeof event.text === 'string' && event.text.trim()) {
            onStatus?.(event.text.trim())
          } else if (event.type === 'result') {
            resultData = event
          } else if (event.type === 'error') {
            streamError = typeof event.error === 'string' ? event.error : 'Stream error'
            if (event.siteAnalysis) {
              resultData = event
            }
          }
        }
      }

      if (signal?.aborted) return abortedResult()

      if (!resultData || streamError) {
        throw new Error(streamError || 'No result in stream')
      }

      return {
        message:
          typeof resultData.message === 'string' && resultData.message.trim()
            ? resultData.message
            : mockFallback(mode, userMessage, context ?? null, preferredLanguage).message,
        workTrace: normalizeWorkTrace(resultData.workTrace),
        questions: normalizeQuestions(resultData.questions),
        proposals: normalizeProposals(resultData.proposals),
        plan: normalizePlan(resultData.plan, fallbackPrompt),
        readyForPlan: Boolean(resultData.readyForPlan),
        siteAnalysis: normalizeSiteAnalysis(resultData.siteAnalysis),
        pageSnapshot: typeof resultData.pageSnapshot === 'string' ? resultData.pageSnapshot : null,
        source: 'gemini',
        model: typeof resultData.model === 'string' ? resultData.model : 'gemini',
      }
    }

    // Legacy JSON response fallback
    const data = (await response.json()) as Record<string, unknown>
    if (Array.isArray(data.workTrace)) {
      for (const line of data.workTrace) {
        if (typeof line === 'string' && line.trim()) onStatus?.(line.trim())
      }
    }

    return {
      message:
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : mockFallback(mode, userMessage, context ?? null, preferredLanguage).message,
      workTrace: normalizeWorkTrace(data.workTrace),
      questions: normalizeQuestions(data.questions),
      proposals: normalizeProposals(data.proposals),
      plan: normalizePlan(data.plan, fallbackPrompt),
      readyForPlan: Boolean(data.readyForPlan),
      siteAnalysis: normalizeSiteAnalysis(data.siteAnalysis),
      pageSnapshot: typeof data.pageSnapshot === 'string' ? data.pageSnapshot : null,
      source: 'gemini',
      model: typeof data.model === 'string' ? data.model : 'gemini',
    }
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return abortedResult()
    }
    return mockFallback(mode, userMessage, context ?? null, preferredLanguage)
  }
}
