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

export interface DiscoveryAiResult {
  message: string
  questions: DiscoveryQuestion[] | null
  proposals: JourneyProposal[] | null
  plan: DiscoveryPlan | null
  readyForPlan: boolean
  source: 'gemini' | 'mock'
  model: string | null
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

function mockFallback(
  mode: DiscoveryAiMode,
  userMessage: string,
  ctx: DiscoveryContext | null,
): DiscoveryAiResult {
  if (mode === 'bootstrap') {
    const nextCtx = ctx ?? createDiscoveryContext(userMessage)
    const knownSite = Boolean(nextCtx.url) || nextCtx.domain !== 'generic'
    if (knownSite) {
      return {
        message:
          "You don't need to know the critical path — for this kind of site, DEM teams usually start with these journeys. **#1 is recommended.** Pick one, or tell me what to change.",
        questions: null,
        proposals: buildJourneyProposals(nextCtx),
        plan: null,
        readyForPlan: false,
        source: 'mock',
        model: null,
      }
    }
    return {
      message:
        "Happy to help — no prior knowledge needed. A few quick choices and I'll recommend solid journeys to monitor.",
      questions: buildDiscoveryQuestions(nextCtx),
      proposals: null,
      plan: null,
      readyForPlan: false,
      source: 'mock',
      model: null,
    }
  }

  if (mode === 'propose' && ctx) {
    return {
      message:
        'Based on that, here are **3 journey options**. Pick one, use **Other**, or keep chatting to refine.',
      questions: null,
      proposals: buildJourneyProposals(ctx),
      plan: null,
      readyForPlan: false,
      source: 'mock',
      model: null,
    }
  }

  if (mode === 'configure' && ctx?.selectedProposal) {
    return {
      message:
        "Avant de figer les étapes, définissons ensemble les paramètres du parcours. Tu peux aussi préciser autrement dans le chat.",
      questions: buildConfigureQuestions(ctx, ctx.selectedProposal),
      proposals: null,
      plan: null,
      readyForPlan: false,
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
      questions: null,
      proposals: null,
      plan,
      readyForPlan: true,
      source: 'mock',
      model: null,
    }
  }

  return {
    message: agentNeedsMoreContextMessage(userMessage),
    questions: null,
    proposals: null,
    plan: null,
    readyForPlan: false,
    source: 'mock',
    model: null,
  }
}

export async function requestDiscoveryAi(options: {
  mode: DiscoveryAiMode
  userMessage: string
  messages?: ChatMessage[]
  phase?: string
  context?: DiscoveryContext | null
  selectedProposal?: JourneyProposal | null
}): Promise<DiscoveryAiResult> {
  const { mode, userMessage, messages = [], phase, context, selectedProposal } = options

  try {
    const response = await fetch('/api/discovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        userMessage,
        phase,
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
            }
          : null,
      }),
    })

    if (!response.ok) {
      throw new Error(`API ${response.status}`)
    }

    const data = (await response.json()) as Record<string, unknown>
    const fallbackPrompt =
      userMessage ||
      context?.seed ||
      (typeof data.message === 'string' ? data.message : 'Monitor critical user journey')

    return {
      message:
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : mockFallback(mode, userMessage, context ?? null).message,
      questions: normalizeQuestions(data.questions),
      proposals: normalizeProposals(data.proposals),
      plan: normalizePlan(data.plan, fallbackPrompt),
      readyForPlan: Boolean(data.readyForPlan),
      source: 'gemini',
      model: typeof data.model === 'string' ? data.model : 'gemini',
    }
  } catch {
    return mockFallback(mode, userMessage, context ?? null)
  }
}
