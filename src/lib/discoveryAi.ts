import {
  answersIncludeSiteDecline,
  looksLikeSiteConfirmation,
  looksLikeSiteDecline,
  messageRequestsSiteWork,
} from '../../api/_lib/discoverySiteIntent'
import type {
  DiscoveryContext,
  DiscoveryPlan,
  DiscoveryQuestion,
  JourneyProposal,
} from '../mock/discovery'
import { t, type Locale } from '../i18n/messages'
import type { ChatMessage } from '../types'
import { ensureFormEntryInPlan } from './journeyLaunch'
import { appendDryRunWarning } from './discoveryChat'
import { redactSensitiveChatContent } from './sensitiveAnswers'

export {
  answersIncludeSiteDecline,
  intentFromDeepLocator,
  looksLikeAmbiguousBrandName,
  looksLikeSiteConfirmation,
  looksLikeSiteDecline,
  looksLikeSocialChat,
  messageRequestsSiteWork,
  summarizeStatedJourneyIntent,
} from '../../api/_lib/discoverySiteIntent'

export type DiscoveryAiMode =
  | 'bootstrap'
  | 'chat'
  | 'propose'
  | 'configure'
  | 'plan'
  | 'iterate'
  | 'relocalize'

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
  /** Floating-form chrome title — must match what the form is asking. */
  formTitle: string | null
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
  return messages.map((m) => {
    const baseContent =
      m.role === 'user' ? redactSensitiveChatContent(m.content) : m.content
    if (!m.attachment?.text) {
      return { role: m.role, content: baseContent }
    }
    return {
      role: m.role,
      content: `${baseContent}\n\n[Attached file: ${m.attachment.filename}]\n\`\`\`json\n${m.attachment.text}\n\`\`\``,
    }
  })
}

/**
 * Meta options that duplicate the footer “Autre chose…” free-text field.
 * Never shown in the list — custom values are typed in the footer.
 */
export function isRedundantOtherOption(option: string): boolean {
  const o = option.trim()
  if (!o) return true
  // Bare labels: "Autre", "Other", "Autre email", "Autre mail", "Other email"…
  if (
    /^(autre|other|custom|personnalis[ée]|saisir|entrer|enter|specify)(\b|$)/i.test(o) &&
    !/@/.test(o) &&
    !/\d{3,}/.test(o)
  ) {
    return true
  }
  return /saisir\s+un\s+autre|entrer\s+un\s+autre|enter\s+another|other\s*\(|autre\s+e-?mails?|autre\s+mails?|autre\s+adresse|other\s+e-?mails?|type\s+another|specify\s+other|saisir\s+ici|free[\s-]?text|votre\s+propre/i.test(
    o,
  )
}

function normalizeQuestions(raw: unknown): DiscoveryQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const next = raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const q = item as Record<string, unknown>
      if (typeof q.prompt !== 'string' || !q.prompt.trim()) return null
      // Free-text journey params / PII / secrets: at most ONE suggested preset;
      // custom = footer “Autre chose…”. Must NOT drop these when options < 2 —
      // that silently killed “quel produit rechercher ?” while keeping quantity.
      const looksFreeText =
        /e-?mail|mail|téléphone|telephone|phone|prénom|prenom|first\s*name|nom\b|last\s*name|coordonn|mot\s*de\s*passe|password|passwd|pwd|secret|otp|identifiant|username|user\s*name|login|utilisateur|produit|product|recherch|search(\s+query)?|requ[eê]te|sku|r[eé]f[eé]rence|quantit[eé]|quantity|\bqty\b|ville|city|date|taille|size|adresse|address/i.test(
          q.prompt,
        )
      let options = Array.isArray(q.options)
        ? q.options
            .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
            .filter((o) => !isRedundantOtherOption(o))
        : []
      // <2 options ⇒ free-text question (0–1 preset). ≥2 ⇒ choice (cap 3).
      // Never drop a valid prompt just because Gemini omitted choice options.
      if (options.length < 2 || looksFreeText) {
        options = options.slice(0, 1)
      } else {
        options = options.slice(0, 3)
      }
      return {
        id: typeof q.id === 'string' && q.id.trim() ? q.id : `q-${index + 1}`,
        prompt: q.prompt.trim(),
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

/** Plan step actions — numbered lists of these are a plan, not journey proposals. */
const PLAN_STEP_ACTION =
  /^(Navigate|Click|Type|Verify|Select|Scroll|Wait|Hover|Assert|Press|Fill|Check|Uncheck|Upload|Download|Tap|Open)\b/i

function looksLikePlanStepTitle(title: string): boolean {
  const t = title.trim()
  if (PLAN_STEP_ACTION.test(t)) return true
  // e.g. "Navigate: Go to…" / "Click on Brochure"
  if (/^(Navigate|Click|Type|Verify)\b[:\s—–-]/i.test(t)) return true
  return false
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

    // Numbered plan steps (Navigate / Click / Type / Verify…) must never become
    // journey-chooser cards — that path frames the message with "pick one below".
    if (looksLikePlanStepTitle(title)) continue

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

/** Canned "pick one in the form below" — wrong when a plan + Lancer is showing. */
function looksLikeProposalChooserCopy(message: string, locale: Locale): boolean {
  const trimmed = message.trim()
  if (!trimmed) return false
  if (trimmed === t(locale, 'journeysSuggested').trim()) return true
  return /choisissez-en un dans le formulaire|pick one in the form below/i.test(trimmed)
}

function stripEnumeratedListFromMessage(message: string): string {
  return message
    .split('\n')
    .filter((line) => !/^\s*\*{0,2}\s*\d{1,2}[.)]\s+\S/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function frameMessageForProposals(locale: Locale, existing: string): string {
  const cleaned = stripEnumeratedListFromMessage(existing)
  if (cleaned && cleaned.length <= 280) return cleaned
  return t(locale, 'journeysSuggested')
}

/** Normalize + recover proposals/questions so the floating clickable UI can open. */
function normalizeFormTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const title = raw.trim().replace(/\s+/g, ' ')
  if (title.length < 2) return null
  return title.slice(0, 80)
}

function finalizeDiscoveryResult(options: {
  message: string
  workTrace: unknown
  formTitle: unknown
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
  mode?: DiscoveryAiMode
  /** User utterance for this turn — used to avoid reviving proposals after a decline. */
  userMessage?: string
  answers?: Record<string, string> | null
  siteUrl?: string | null
}): DiscoveryAiResult {
  const siteAnalysis = normalizeSiteAnalysis(options.siteAnalysis)
  const awaitingConfirm = siteAnalysis?.reason === 'awaiting_user_confirmation'
  const declined =
    looksLikeSiteDecline(options.userMessage ?? '') ||
    answersIncludeSiteDecline(options.answers)
  const questions = declined ? null : normalizeQuestions(options.questions)
  let proposals =
    awaitingConfirm || declined ? null : normalizeProposals(options.proposals)
  let message = options.message.trim()

  let plan = normalizePlan(options.plan, options.fallbackPrompt)
  if (plan) {
    plan = ensureFormEntryInPlan(plan, {
      siteUrl: options.siteUrl ?? siteAnalysis?.url ?? null,
      prompt: options.fallbackPrompt,
      locale: options.preferredLanguage,
    })
  }
  const readyForPlan = Boolean(options.readyForPlan)
  // Plan + Lancer wins: never recover/frame journey proposals from plan step lists.
  const hasAuthoritativePlan = Boolean(plan && (readyForPlan || plan.steps.length > 0))

  // Never turn "1. Oui / 2. Non" confirm copy into journey proposal cards.
  // Also never revive proposals from prose after the user declined a site candidate
  // (API already nulls proposals[]; recovery must not undo that hard gate).
  // Relocalize must never invent journeys from a translate-only reply.
  // When a runnable plan is present, numbered steps are the plan — not a chooser.
  if (
    !hasAuthoritativePlan &&
    !proposals &&
    !questions &&
    !awaitingConfirm &&
    !declined &&
    options.mode !== 'relocalize' &&
    options.mode !== 'iterate'
  ) {
    proposals = recoverProposalsFromMessage(message, options.fallbackPrompt)
  }

  if (hasAuthoritativePlan) {
    proposals = null
    // Drop canned chooser framing — Home will render the plan + Lancer.
    if (looksLikeProposalChooserCopy(message, options.preferredLanguage)) {
      message = ''
    }
  } else if (proposals && proposals.length > 0) {
    message = frameMessageForProposals(options.preferredLanguage, message)
  }

  let formTitle = normalizeFormTitle(options.formTitle)
  if (questions || proposals) {
    if (awaitingConfirm) {
      formTitle = t(options.preferredLanguage, 'confirmSite')
    } else if (!formTitle) {
      if (proposals) {
        formTitle = t(options.preferredLanguage, 'chooseJourney')
      } else if (options.mode === 'configure') {
        formTitle = t(options.preferredLanguage, 'configureJourney')
      } else {
        formTitle = t(options.preferredLanguage, 'clarifyRequest')
      }
    }
  }

  // Empty message is OK with an authoritative plan (plan text is injected in UI).
  // Do not fall back to the "assistant unavailable" copy in that case.
  const resolvedMessage = message.trim()
    ? message
    : hasAuthoritativePlan
      ? ''
      : geminiUnavailable(options.preferredLanguage).message

  const withDryRun = appendDryRunWarning(
    resolvedMessage,
    normalizeWorkTrace(options.workTrace),
    options.preferredLanguage,
  )

  return {
    message: withDryRun,
    workTrace: normalizeWorkTrace(options.workTrace),
    formTitle: questions || proposals ? formTitle : null,
    questions,
    proposals,
    plan,
    readyForPlan,
    siteAnalysis,
    pageSnapshot: typeof options.pageSnapshot === 'string' ? options.pageSnapshot : null,
    source: options.source,
    model: typeof options.model === 'string' ? options.model : null,
  }
}

function normalizePlan(raw: unknown, fallbackPrompt: string): DiscoveryPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const steps = Array.isArray(p.steps)
    ? p.steps.flatMap((step) => {
        if (!step || typeof step !== 'object') return []
        const s = step as Record<string, unknown>
        if (typeof s.label !== 'string' || typeof s.action !== 'string') return []
        const normalized: DiscoveryPlan['steps'][number] = {
          label: s.label,
          action: s.action,
        }
        if (typeof s.targetHint === 'string') normalized.targetHint = s.targetHint
        if (typeof s.href === 'string') normalized.href = s.href
        return [normalized]
      })
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
function geminiUnavailable(
  preferredLanguage: Locale,
  reason?: string | null,
): DiscoveryAiResult {
  const quota =
    typeof reason === 'string' &&
    /\b429\b|Too Many Requests|quota|rate.?limit|Quota exceeded/i.test(reason)
  return {
    message: t(
      preferredLanguage,
      quota ? 'assistantQuotaExceeded' : 'assistantUnavailable',
    ),
    workTrace: null,
    formTitle: null,
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
    formTitle: null,
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
        history: mode === 'relocalize' ? [] : historyFromMessages(messages),
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
        context: (() => {
          const declined =
            Boolean(context?.url) &&
            (looksLikeSiteDecline(userMessage) ||
              Object.values(context?.answers ?? {}).some(
                (value) => typeof value === 'string' && looksLikeSiteDecline(value),
              ))
          const attachSite =
            mode !== 'relocalize' &&
            !declined &&
            (mode === 'propose' ||
              mode === 'configure' ||
              mode === 'plan' ||
              mode === 'iterate' ||
              messageRequestsSiteWork(userMessage) ||
              (looksLikeSiteConfirmation(userMessage) && Boolean(context?.url)))
          if (!context || mode === 'relocalize') {
            return { preferredLanguage, journeyName, currentSteps }
          }
          if (!attachSite) {
            return {
              preferredLanguage,
              journeyName,
              currentSteps,
              answers: declined ? {} : context.answers,
              selectedProposalId: context.selectedProposalId,
              seed: null,
              url: null,
              pageSnapshot: null,
            }
          }
          return {
            seed: context.seed,
            url: context.url,
            answers: context.answers,
            selectedProposalId: context.selectedProposalId,
            // On bare confirmation, force a fresh explore of the candidate URL.
            pageSnapshot:
              looksLikeSiteConfirmation(userMessage) && !messageRequestsSiteWork(userMessage)
                ? null
                : context.pageSnapshot ?? null,
            preferredLanguage,
            journeyName,
            currentSteps,
          }
        })(),
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
        formTitle: resultData.formTitle,
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
        mode,
        userMessage,
        answers: context?.answers ?? null,
        siteUrl: context?.url ?? null,
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
      formTitle: data.formTitle,
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
      mode,
      userMessage,
      answers: context?.answers ?? null,
      siteUrl: context?.url ?? null,
    })
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return abortedResult()
    }
    return geminiUnavailable(
      preferredLanguage,
      error instanceof Error ? error.message : null,
    )
  }
}
