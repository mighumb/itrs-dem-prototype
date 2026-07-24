import type {
  DiscoveryContext,
  DiscoveryPlan,
  DiscoveryQuestion,
  JourneyProposal,
} from '../mock/discovery'
import type { ChatMessage } from '../types'

export type DiscoveryAiMode = 'bootstrap' | 'chat' | 'propose' | 'configure' | 'plan' | 'iterate'

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
  /** Nominal path is always gemini. unavailable = API/key/network failure (no scripted discovery). */
  source: 'gemini' | 'unavailable'
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
      if (typeof p.title !== 'string' || !p.title.trim()) return null
      const title = p.title.trim()
      const description =
        typeof p.description === 'string' && p.description.trim()
          ? p.description.trim()
          : title
      const prompt =
        typeof p.prompt === 'string' && p.prompt.trim() ? p.prompt.trim() : title
      return {
        id: typeof p.id === 'string' && p.id.trim() ? p.id : `proposal-${index + 1}`,
        title,
        description,
        prompt,
      }
    })
    .filter((p): p is JourneyProposal => Boolean(p))
  return next.length > 0 ? next.slice(0, 3) : null
}

function stripMarkdownInline(text: string): string {
  return text.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim()
}

/** When Gemini lists journeys in message but leaves proposals null/invalid. */
export function recoverProposalsFromMessage(
  message: string,
  seed = '',
): JourneyProposal[] | null {
  if (!message.trim()) return null

  const proposals: JourneyProposal[] = []
  const lines = message.split(/\n/)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim()
    if (!raw) continue

    const match = raw.match(/^\*{0,2}\s*(\d{1,2})[.)]\s*\*{0,2}\s*(.+?)\s*\*{0,2}\s*$/)
    if (!match) continue

    let title = stripMarkdownInline(match[2]!)
    let description = ''

    const split = title.split(/\s*[—–]\s+|\s+-\s+/)
    if (split.length >= 2) {
      title = split[0]!.trim()
      description = split.slice(1).join(' — ').trim()
    } else {
      const colon = title.match(/^(.+?)\s*:\s+(.+)$/)
      if (colon) {
        title = colon[1]!.trim()
        description = colon[2]!.trim()
      }
    }

    if (!description && i + 1 < lines.length) {
      const nextLine = lines[i + 1]!.trim()
      if (
        nextLine &&
        !/^\*{0,2}\s*\d{1,2}[.)]/.test(nextLine) &&
        nextLine.length < 220 &&
        !/^(lequel|which|choisis|pick|voici|here are)\b/i.test(nextLine)
      ) {
        description = stripMarkdownInline(nextLine)
      }
    }

    title = title.replace(/\s*\((?:suggéré|suggested|recommandé|recommended)\)\s*$/i, '').trim()
    if (title.length < 2) continue

    proposals.push({
      id: `recovered-${match[1]}`,
      title,
      description: description || title,
      prompt: seed.trim() ? `${seed.trim()} — ${title}` : title,
    })
  }

  return proposals.length >= 2 ? proposals.slice(0, 3) : null
}

function stripEnumeratedListFromMessage(message: string): string {
  return message
    .split('\n')
    .filter((line) => !/^\s*\*{0,2}\s*\d{1,2}[.)]\s+\S/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function frameMessageForProposals(locale: 'en' | 'fr', existing: string): string {
  const cleaned = stripEnumeratedListFromMessage(existing)
  if (cleaned && cleaned.length <= 280) return cleaned
  return locale === 'fr'
    ? 'Voici les parcours que je te propose — choisis dans le formulaire ci-dessous.'
    : 'Here are the journeys I suggest — pick one in the form below.'
}

/** Normalize + recover proposals/questions so the floating clickable UI can open. */
function finalizeDiscoveryResult(options: {
  message: string
  workTrace: unknown
  questions: unknown
  proposals: unknown
  plan: unknown
  readyForPlan: unknown
  siteAnalysis: unknown
  pageSnapshot: unknown
  model: unknown
  fallbackPrompt: string
  preferredLanguage: 'en' | 'fr'
  source: 'gemini' | 'unavailable'
}): DiscoveryAiResult {
  const questions = normalizeQuestions(options.questions)
  let proposals = normalizeProposals(options.proposals)
  let message = options.message.trim()

  if (!proposals && !questions) {
    proposals = recoverProposalsFromMessage(message, options.fallbackPrompt)
  }

  if (proposals && proposals.length > 0) {
    message = frameMessageForProposals(options.preferredLanguage, message)
  }

  return {
    message: message || geminiUnavailable(options.preferredLanguage).message,
    workTrace: normalizeWorkTrace(options.workTrace),
    questions,
    proposals,
    plan: normalizePlan(options.plan, options.fallbackPrompt),
    readyForPlan: Boolean(options.readyForPlan),
    siteAnalysis: normalizeSiteAnalysis(options.siteAnalysis),
    pageSnapshot: typeof options.pageSnapshot === 'string' ? options.pageSnapshot : null,
    source: options.source,
    model: typeof options.model === 'string' ? options.model : null,
  }
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

/** Honest outage notice — no scripted questionnaire / proposals / plans. */
function geminiUnavailable(preferredLanguage: 'en' | 'fr'): DiscoveryAiResult {
  return {
    message:
      preferredLanguage === 'fr'
        ? 'L’assistant est indisponible pour le moment. Réessaie dans un instant — je ne peux pas inventer un parcours hors ligne.'
        : 'The assistant is unavailable right now. Try again in a moment — I won’t invent an offline journey.',
    workTrace: null,
    questions: null,
    proposals: null,
    plan: null,
    readyForPlan: false,
    siteAnalysis: null,
    pageSnapshot: null,
    source: 'unavailable',
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
  journeyName?: string | null
  currentSteps?: Array<{ id?: string; label: string; action: string }> | null
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
    journeyName = null,
    currentSteps = null,
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
    source: 'unavailable',
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
              journeyName,
              currentSteps,
            }
          : { preferredLanguage, journeyName, currentSteps },
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

      const message =
        typeof resultData.message === 'string' && resultData.message.trim()
          ? resultData.message
          : ''

      return finalizeDiscoveryResult({
        message,
        workTrace: resultData.workTrace,
        questions: resultData.questions,
        proposals: resultData.proposals,
        plan: resultData.plan,
        readyForPlan: resultData.readyForPlan,
        siteAnalysis: resultData.siteAnalysis,
        pageSnapshot: resultData.pageSnapshot,
        model: resultData.model ?? 'gemini',
        fallbackPrompt,
        preferredLanguage,
        source: message ? 'gemini' : 'unavailable',
      })
    }

    // Legacy JSON response fallback
    const data = (await response.json()) as Record<string, unknown>
    if (Array.isArray(data.workTrace)) {
      for (const line of data.workTrace) {
        if (typeof line === 'string' && line.trim()) onStatus?.(line.trim())
      }
    }

    const message =
      typeof data.message === 'string' && data.message.trim() ? data.message : ''

    return finalizeDiscoveryResult({
      message,
      workTrace: data.workTrace,
      questions: data.questions,
      proposals: data.proposals,
      plan: data.plan,
      readyForPlan: data.readyForPlan,
      siteAnalysis: data.siteAnalysis,
      pageSnapshot: data.pageSnapshot,
      model: data.model ?? 'gemini',
      fallbackPrompt,
      preferredLanguage,
      source: message ? 'gemini' : 'unavailable',
    })
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return abortedResult()
    }
    return geminiUnavailable(preferredLanguage)
  }
}
