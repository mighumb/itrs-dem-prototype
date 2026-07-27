import { GoogleGenerativeAI } from '@google/generative-ai'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { analyzePublicSite, type SiteAnalysisResult } from './_lib/analyzeSite.js'
import {
  explorePublicSite,
  peekExploreCache,
  siteExplorePromptView,
  type SiteExploreResult,
} from './_lib/exploreSite.js'
import { applyGroundingToPlan } from './_lib/planGrounding.js'
import {
  dryRunJourneyWithPlaywright,
  type RunnableStep,
} from './_lib/playwrightRunner.js'
import { DISCOVERY_SYSTEM_PROMPT } from './_lib/discoverySystemPrompt.js'
import {
  answersIncludeSiteDecline,
  hasExplicitSiteLocator,
  looksLikeAmbiguousBrandName,
  looksLikeSiteConfirmation,
  looksLikeSiteDecline,
  messageRequestsSiteWork,
  summarizeStatedJourneyIntent,
} from './_lib/discoverySiteIntent.js'
import {
  buildRelocalizeUserPrompt,
  mergeRelocalizedForm,
  parseRelocalizeSource,
  RELOCALIZE_SYSTEM_PROMPT,
} from './_lib/relocalizeForm.js'
import {
  resolveSiteTarget,
  type ResolvedSiteTarget,
} from './_lib/resolveSiteTarget.js'
import { geminiModelCandidates } from './_lib/geminiModels.js'
import { geminiApiKeys } from './_lib/geminiKeys.js'

type ChatTurn = { role: 'user' | 'agent'; content: string }

type DiscoveryAiRequest = {
  mode: 'bootstrap' | 'chat' | 'propose' | 'configure' | 'plan' | 'iterate' | 'relocalize'
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
    journeyName?: string | null
    currentSteps?: Array<{ id?: string; label: string; action: string }> | null
  }
}

/** Message names a different/new site vs leftover context — ignore cached URL/snapshot. */
function messageNamesNewSite(text: string): boolean {
  return hasExplicitSiteLocator(text) || looksLikeAmbiguousBrandName(text)
}

/** User rejected a site candidate — drop URL/evidence and never open proposals. */
function isSiteCandidateDeclined(body: DiscoveryAiRequest): boolean {
  if (looksLikeSiteDecline(body.userMessage)) return true
  return answersIncludeSiteDecline(body.context?.answers)
}

function shouldAttachSiteEvidence(body: DiscoveryAiRequest): boolean {
  if (body.mode === 'relocalize') return false
  if (/\brelocalize_ui\b/.test(body.userMessage)) return false
  // Declining a confirm candidate must never keep the URL or open proposals.
  if (isSiteCandidateDeclined(body)) return false
  if (['propose', 'configure', 'plan', 'iterate'].includes(body.mode)) return true
  if (body.mode === 'bootstrap' || body.mode === 'chat') {
    if (messageRequestsSiteWork(body.userMessage)) return true
    // Affirmation after we proposed a candidate URL — explore that site next.
    if (looksLikeSiteConfirmation(body.userMessage) && body.context?.url) return true
  }
  return false
}

/** Brand→URL was inferred — always confirm destination before crawl / proposals. */
function shouldConfirmBeforeExplore(
  body: DiscoveryAiRequest,
  target: ResolvedSiteTarget | null,
): boolean {
  if (body.mode !== 'bootstrap' && body.mode !== 'chat') return false
  if (!target?.url || target.source !== 'brand_resolve') return false
  // User already affirmed the candidate this turn — proceed to explore.
  if (looksLikeSiteConfirmation(body.userMessage) && body.context?.url) return false
  return true
}

function buildUserPrompt(
  body: DiscoveryAiRequest,
  analysis: SiteAnalysisResult | null,
  target: ResolvedSiteTarget | null,
  explore: SiteExploreResult | null,
): string {
  const preferredLanguage =
    body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const attachSite = shouldAttachSiteEvidence(body)
  const confirmFirst = shouldConfirmBeforeExplore(body, target)
  const base = body.context ?? {}
  const seed = typeof base.seed === 'string' ? base.seed.trim() : ''
  // Latest user turn wins when they revise the journey; seed is the default otherwise.
  const fromLatest = summarizeStatedJourneyIntent(body.userMessage)
  const fromSeed = summarizeStatedJourneyIntent(seed)
  const statedJourneyIntent = fromLatest ?? fromSeed
  const intentSource = fromLatest ? 'latest' : fromSeed ? 'seed' : null

  const context = attachSite
    ? {
        ...base,
        preferredLanguage,
        seed: seed || base.seed || null,
        /** Original/latest journey ask — proposals MUST honor this when set. */
        statedJourneyIntent,
        statedJourneyIntentSource: intentSource,
        url: analysis?.url ?? target?.url ?? base.url ?? null,
        pageSnapshot: confirmFirst
          ? null
          : analysis?.snapshot ?? base.pageSnapshot ?? null,
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
        siteExplore: confirmFirst ? null : siteExplorePromptView(explore),
        // Ambiguous acronym/name: candidate ready — confirm with user before proposals.
        siteConfirmation: confirmFirst
          ? {
              needed: true,
              candidateUrl: target?.url ?? null,
              candidateLabel: target?.label ?? null,
            }
          : { needed: false },
      }
    : {
        // Conversational turn: no leftover seed/url/explore — avoids site hallucinations.
        preferredLanguage,
        answers: base.answers ?? {},
        selectedProposalId: base.selectedProposalId ?? null,
        journeyName: base.journeyName ?? null,
        currentSteps: base.currentSteps ?? null,
        seed: null,
        statedJourneyIntent: null,
        url: null,
        pageSnapshot: null,
        siteTarget: null,
        siteAnalysis: null,
        siteExplore: null,
        siteConfirmation: { needed: false },
      }

  // After a bare "oui", keep the seed journey ask visible; if they revised in this
  // message, statedJourneyIntent already comes from the latest turn.
  const userMessage =
    !fromLatest &&
    statedJourneyIntent &&
    looksLikeSiteConfirmation(body.userMessage) &&
    !confirmFirst
      ? `${body.userMessage}\n\n[Original monitoring request — honor for proposals #1]: ${statedJourneyIntent}`
      : body.userMessage

  return JSON.stringify(
    {
      mode: body.mode,
      phase: body.phase ?? null,
      preferredLanguage,
      userMessage,
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
  explore: SiteExploreResult | null,
  streamedStatuses: string[],
): string[] | null {
  const fromModel = Array.isArray(raw)
    ? raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((line) => line.trim())
    : []

  const prefix: string[] = []
  if (target?.note) prefix.push(target.note)
  if (explore?.ok && explore.method === 'playwright') {
    prefix.push(
      `Explored ${explore.pagesVisited} page${explore.pagesVisited === 1 ? '' : 's'} on ${explore.url}`,
    )
  } else if (analysis) {
    if (analysis.ok) {
      prefix.push(
        `Inspected ${analysis.url}${analysis.title ? ` — ${analysis.title}` : ''}${
          explore?.method === 'http-fallback' ? ' (HTTP fallback)' : ''
        }`,
      )
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

/** Translate floating-form copy only — no Discovery site/journey pipeline. */
async function handleRelocalize(
  body: DiscoveryAiRequest,
  res: VercelResponse,
  apiKeyEntries: ReturnType<typeof geminiApiKeys>,
  sendStatus: (text: string) => void,
) {
  const lang = body.preferredLanguage ?? 'en'
  const fr = lang === 'fr'
  const source = parseRelocalizeSource(body.userMessage)
  const hasProposals = Array.isArray(source.proposals) && source.proposals.length > 0
  const hasQuestions = Array.isArray(source.questions) && source.questions.length > 0

  if (!hasProposals && !hasQuestions) {
    writeNdjson(res, {
      type: 'result',
      message: fr ? 'Rien à traduire.' : 'Nothing to translate.',
      workTrace: null,
      formTitle: null,
      questions: null,
      proposals: null,
      plan: null,
      readyForPlan: false,
      pageSnapshot: null,
      siteTarget: null,
      siteConfirmation: { needed: false },
      siteAnalysis: null,
      model: null,
    })
    return res.end()
  }

  sendStatus(fr ? 'Traduction du formulaire…' : 'Translating the form…')

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const isQuotaError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    return /\b429\b|Too Many Requests|quota|rate.?limit/i.test(message)
  }
  const isHardQuotaExhausted = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    return /limit:\s*0\b/i.test(message) || /GenerateRequestsPerDayPerProjectPerModel/i.test(message)
  }
  const retryDelayMs = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const match = message.match(/retry in ([\d.]+)\s*s/i)
    if (!match) return 1500
    return Math.min(8000, Math.max(500, Math.ceil(parseFloat(match[1]) * 1000)))
  }

  let lastError: unknown
  for (const entry of apiKeyEntries) {
    const genAI = new GoogleGenerativeAI(entry.key)
    const modelCandidates = geminiModelCandidates(entry.tier)
    let quotaHitsOnThisKey = 0

    for (const modelName of modelCandidates) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: RELOCALIZE_SYSTEM_PROMPT,
            generationConfig: {
              temperature: 0.2,
            },
          })

          const result = await model.generateContent(
            buildRelocalizeUserPrompt(source, lang),
          )
          const fullText = result.response.text()
          const { parsed: rawParsed } = parseModelOutput(fullText)
          const merged = mergeRelocalizedForm(source, rawParsed ?? {}, lang)

          writeNdjson(res, {
            type: 'result',
            message: merged.message,
            workTrace: null,
            formTitle: merged.formTitle,
            questions: merged.questions,
            proposals: merged.proposals,
            plan: null,
            readyForPlan: false,
            pageSnapshot: null,
            siteTarget: null,
            siteConfirmation: { needed: false },
            siteAnalysis: null,
            model: modelName,
          })
          return res.end()
        } catch (error) {
          lastError = error
          if (isQuotaError(error)) {
            quotaHitsOnThisKey += 1
            if (isHardQuotaExhausted(error) || attempt === 1) break
            await sleep(retryDelayMs(error))
            continue
          }
          break
        }
      }
      if (quotaHitsOnThisKey >= 2) break
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'Relocalize failed'
  writeNdjson(res, { type: 'error', error: message })
  return res.end()
}

async function resolveTargetOnly(
  body: DiscoveryAiRequest,
  apiKeys: string[],
): Promise<ResolvedSiteTarget | null> {
  if (!shouldAttachSiteEvidence(body)) {
    return null
  }

  const newSite = messageNamesNewSite(body.userMessage)

  // Cached snapshot is only safe when the user is still talking about that same site.
  if (body.context?.pageSnapshot && !newSite) {
    const existing = body.context?.url ?? null
    return existing
      ? { url: existing, source: 'explicit_url', label: null, note: null }
      : null
  }

  if (/\brelocalize_ui\b/.test(body.userMessage)) {
    const existing = body.context?.url ?? null
    return existing
      ? { url: existing, source: 'explicit_url', label: null, note: null }
      : null
  }

  if (!['bootstrap', 'chat', 'propose', 'configure', 'plan', 'iterate'].includes(body.mode)) {
    return null
  }

  // bootstrap/chat: resolve from THIS message only (never glue leftover seed).
  // Journey modes may still use seed + message.
  const seedText = ['propose', 'configure', 'plan', 'iterate'].includes(body.mode)
    ? [body.userMessage, body.context?.seed].filter(Boolean).join(' — ')
    : body.userMessage

  return resolveSiteTarget(seedText, {
    apiKeys,
    existingUrl: newSite ? null : (body.context?.url ?? null),
    preferMessageOverExisting: newSite,
    preferredLanguage: body.preferredLanguage ?? body.context?.preferredLanguage ?? null,
  })
}

async function gatherSiteEvidence(
  body: DiscoveryAiRequest,
  target: ResolvedSiteTarget | null,
  onStatus: (text: string) => void,
): Promise<{ analysis: SiteAnalysisResult | null; explore: SiteExploreResult | null }> {
  if (!shouldAttachSiteEvidence(body)) {
    return { analysis: null, explore: null }
  }

  // Ambiguous brand/acronym: resolve URL only — confirm with the user before crawl.
  if (shouldConfirmBeforeExplore(body, target)) {
    return { analysis: null, explore: null }
  }

  // Cached evidence from a prior turn — do not re-crawl.
  if (body.context?.pageSnapshot) {
    const url = body.context.url ?? target?.url ?? ''
    const cachedExplore = peekExploreCache(url)
    return {
      analysis: {
        ok: true,
        url,
        reason: null,
        snapshot: body.context.pageSnapshot,
        title: cachedExplore?.title ?? null,
        status: 200,
      },
      explore: cachedExplore,
    }
  }

  if (/\brelocalize_ui\b/.test(body.userMessage)) {
    return { analysis: null, explore: null }
  }

  if (!target?.url) {
    return { analysis: null, explore: null }
  }

  // Fresh browser explore (Playwright) with HTTP fallback inside explorePublicSite.
  // Keep budget tight so a plan dry-run can still fit in the function window.
  const { explore, analysis } = await explorePublicSite(target.url, {
    preferredLanguage: body.preferredLanguage ?? body.context?.preferredLanguage ?? null,
    onStatus,
    maxPages: 6,
    deadlineMs: 20_000,
  })

  // If both failed hard, still try a last HTTP pass (explore already does this,
  // but keep analyzePublicSite available if explore returned method none without snapshot).
  if (!analysis.ok && !analysis.snapshot) {
    const fallback = await analyzePublicSite(target.url)
    return { analysis: fallback, explore }
  }

  return { analysis, explore }
}

function planStepsToRunnable(
  plan: Record<string, unknown>,
  seedUrl: string | null,
): RunnableStep[] {
  const steps = Array.isArray(plan.steps) ? plan.steps : []
  return steps
    .map((step, index) => {
      if (!step || typeof step !== 'object') return null
      const s = step as Record<string, unknown>
      if (typeof s.label !== 'string' || typeof s.action !== 'string') return null
      const href = typeof s.href === 'string' ? s.href : undefined
      const targetHint = typeof s.targetHint === 'string' ? s.targetHint : undefined
      return {
        id: `dry-${index + 1}`,
        label: s.label,
        action: s.action,
        href,
        targetHint,
        target: href ?? (index === 0 ? seedUrl ?? undefined : undefined),
      }
    })
    .filter((s): s is RunnableStep => Boolean(s))
}

async function groundAndMaybeDryRunPlan(options: {
  parsed: Record<string, unknown>
  explore: SiteExploreResult | null
  analysis: SiteAnalysisResult | null
  target: ResolvedSiteTarget | null
  body: DiscoveryAiRequest
  requestStartedAt: number
  sendStatus: (text: string) => void
  confirmFirst?: boolean
}): Promise<Record<string, unknown>> {
  const { explore, analysis, target, body, requestStartedAt, sendStatus, confirmFirst } = options
  let parsed = { ...options.parsed }
  const lang = body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const budgetLeft = () => 55_000 - (Date.now() - requestStartedAt)

  // Never dry-run (or keep a plan) while still confirming the site.
  if (confirmFirst) {
    return { ...parsed, plan: null, readyForPlan: false, proposals: null }
  }

  if (!parsed.plan || typeof parsed.plan !== 'object' || !parsed.readyForPlan) {
    return parsed
  }

  const grounded = applyGroundingToPlan(parsed.plan as Record<string, unknown>, explore)
  parsed = { ...parsed, plan: grounded.plan }

  if (grounded.issues.length > 0) {
    const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
    trace.push(
      lang === 'fr'
        ? 'Certaines étapes manquent encore d’ancrage observé — hypothèses possibles'
        : 'Some steps still lack observed anchors — may include hypotheses',
    )
    parsed.workTrace = trace.slice(0, 8)
  }

  // Dry-run when we still have time (explore cache hits leave more room).
  if (budgetLeft() < 16_000) {
    return parsed
  }

  const seedUrl = analysis?.url ?? target?.url ?? body.context?.url ?? null
  const runnable = planStepsToRunnable(parsed.plan as Record<string, unknown>, seedUrl)
  if (runnable.length === 0) return parsed

  sendStatus(
    lang === 'fr'
      ? 'Je vérifie le parcours dans le navigateur…'
      : 'Checking the journey in the browser…',
  )

  const dry = await dryRunJourneyWithPlaywright({
    steps: runnable.slice(0, 8),
    prompt:
      typeof (parsed.plan as Record<string, unknown>).prompt === 'string'
        ? ((parsed.plan as Record<string, unknown>).prompt as string)
        : body.userMessage,
    deadlineMs: Math.min(18_000, budgetLeft() - 4_000),
  })

  const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
  if (dry.ok) {
    trace.push(
      lang === 'fr'
        ? `Répétition OK (${dry.stepsOk} étapes)`
        : `Dry-run OK (${dry.stepsOk} steps)`,
    )
  } else {
    trace.push(
      lang === 'fr'
        ? `Répétition partielle — étape ${
            dry.failedIndex != null ? dry.failedIndex + 1 : '?'
          } fragile${dry.error ? ` (${dry.error})` : ''}`
        : `Partial dry-run — step ${
            dry.failedIndex != null ? dry.failedIndex + 1 : '?'
          } fragile${dry.error ? ` (${dry.error})` : ''}`,
    )
    // Keep readyForPlan true — user can still run; honesty lives in workTrace.
  }
  parsed.workTrace = trace.slice(0, 8)
  return parsed
}

function candidateHostLabel(url: string | null | undefined): string {
  if (!url) return 'this site'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0] || url
  }
}

function buildResultPayload(
  parsed: Record<string, unknown>,
  analysis: SiteAnalysisResult | null,
  target: ResolvedSiteTarget | null,
  explore: SiteExploreResult | null,
  body: DiscoveryAiRequest,
  modelName: string,
  streamedStatuses: string[],
  confirmFirst: boolean,
) {
  const declined = isSiteCandidateDeclined(body)
  // Hard gates: never ship journey proposals while confirming the site, or after the
  // user declined the candidate (e.g. « c'était juste un souhait »).
  const proposals =
    confirmFirst || declined || !Array.isArray(parsed.proposals) ? null : parsed.proposals
  let questions = declined
    ? null
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : null
  const lang = body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const fr = lang === 'fr'
  const host = candidateHostLabel(target?.url)

  // Server-owned URL fact-check UI: always the candidate host + decline.
  // Never ship model-invented alternate hosts as soft options.
  if (confirmFirst && !declined) {
    const yes = fr ? `Oui, ${host}` : `Yes, ${host}`
    const no = fr ? 'Non, autre site' : 'No, another site'
    questions = [
      {
        id: 'site-confirm',
        prompt: fr
          ? `Le site à surveiller est-il bien ${host} ?`
          : `Is ${host} the site to monitor?`,
        options: [yes, no],
        allowOther: true,
      },
    ]
  }

  const rawFormTitle =
    typeof parsed.formTitle === 'string' && parsed.formTitle.trim()
      ? parsed.formTitle.trim().slice(0, 80)
      : null
  // Purpose-matched titles. On confirm-site, always override a wrong model title.
  let formTitle = rawFormTitle
  if (questions || proposals) {
    if (confirmFirst) {
      formTitle = fr ? 'Confirmer le site' : 'Confirm the site'
    } else if (!formTitle) {
      if (proposals) {
        formTitle = fr ? 'Choisir un parcours' : 'Choose a journey'
      } else if (body.mode === 'configure') {
        formTitle = fr ? 'Configurer le parcours' : 'Configure this journey'
      } else {
        formTitle = fr ? 'Préciser votre demande' : 'Clarify your request'
      }
    }
  }

  const fallbackMessage = confirmFirst
    ? fr
      ? `J’ai trouvé ${host} comme site officiel. Tu confirmes que c’est bien l’URL à surveiller ?`
      : `I found ${host} as the official site. Confirm this is the URL to monitor?`
    : fr
      ? 'Voici ce que je propose.'
      : 'Here is what I suggest.'

  // While confirming, prefer a host-locked message — model copy can invent alternate sites.
  const message = confirmFirst
    ? fallbackMessage
    : typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message
      : fallbackMessage

  return {
    type: 'result' as const,
    message,
    workTrace: normalizeWorkTrace(
      parsed.workTrace,
      declined ? null : analysis,
      declined ? null : target,
      declined ? null : explore,
      streamedStatuses,
    ),
    formTitle: questions || proposals ? formTitle : null,
    questions,
    proposals,
    plan:
      confirmFirst || declined
        ? null
        : parsed.plan && typeof parsed.plan === 'object'
          ? parsed.plan
          : null,
    readyForPlan: confirmFirst || declined ? false : Boolean(parsed.readyForPlan),
    pageSnapshot:
      confirmFirst || declined
        ? null
        : analysis?.snapshot ?? body.context?.pageSnapshot ?? null,
    siteTarget: declined ? null : target,
    siteConfirmation: confirmFirst
      ? {
          needed: true,
          candidateUrl: target?.url ?? null,
          candidateLabel: target?.label ?? null,
        }
      : { needed: false },
    siteAnalysis: declined
      ? null
      : analysis
        ? {
            ok: analysis.ok,
            url: analysis.url,
            reason: analysis.reason,
            title: analysis.title,
            status: analysis.status,
            exploreMethod: explore?.method ?? null,
            pagesVisited: explore?.pagesVisited ?? null,
          }
        : target?.url
          ? {
              // Candidate from brand resolve — client keeps URL for the confirm turn.
              ok: false,
              url: target.url,
              reason: confirmFirst ? 'awaiting_user_confirmation' : null,
              title: target.label,
              status: null,
              exploreMethod: null,
              pagesVisited: null,
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

  const apiKeyEntries = geminiApiKeys()
  if (apiKeyEntries.length === 0) {
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

  if (body.mode === 'relocalize') {
    return handleRelocalize(body, res, apiKeyEntries, sendStatus)
  }

  let analysis: SiteAnalysisResult | null = null
  let target: ResolvedSiteTarget | null = null
  let explore: SiteExploreResult | null = null
  const requestStartedAt = Date.now()

  try {
    target = await resolveTargetOnly(
      body,
      apiKeyEntries.map((entry) => entry.key),
    )
    const confirmFirst = shouldConfirmBeforeExplore(body, target)

    ;({ analysis, explore } = await gatherSiteEvidence(body, target, sendStatus))

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const isQuotaError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      return /\b429\b|Too Many Requests|quota|rate.?limit/i.test(message)
    }
    const isHardQuotaExhausted = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      // Free-tier daily/minute caps reported as limit: 0 — retrying the same model wastes time.
      return /limit:\s*0\b/i.test(message) || /GenerateRequestsPerDayPerProjectPerModel/i.test(message)
    }
    const retryDelayMs = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      const match = message.match(/retry in ([\d.]+)\s*s/i)
      if (!match) return 1500
      return Math.min(8000, Math.max(500, Math.ceil(parseFloat(match[1]) * 1000)))
    }

    let lastError: unknown
    for (const entry of apiKeyEntries) {
      const genAI = new GoogleGenerativeAI(entry.key)
      const modelCandidates = geminiModelCandidates(entry.tier)
      let quotaHitsOnThisKey = 0

      for (const modelName of modelCandidates) {
        for (let attempt = 0; attempt < 2; attempt++) {
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
              buildUserPrompt(body, analysis, target, explore),
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

            const { statuses, parsed: rawParsed } = parseModelOutput(fullText || buffer)
            for (const status of statuses) {
              if (!streamedStatuses.includes(status)) {
                streamedStatuses.push(status)
                sendStatus(status)
              }
            }

            const parsed = await groundAndMaybeDryRunPlan({
              parsed: rawParsed,
              explore,
              analysis,
              target,
              body,
              requestStartedAt,
              sendStatus,
              confirmFirst,
            })

            writeNdjson(
              res,
              buildResultPayload(
                parsed,
                analysis,
                target,
                explore,
                body,
                modelName,
                streamedStatuses,
                confirmFirst,
              ),
            )
            return res.end()
          } catch (error) {
            lastError = error
            console.error(
              `[api/discovery] ${entry.label} (${entry.tier}) model ${modelName} attempt ${attempt + 1} failed`,
              error,
            )
            if (isQuotaError(error)) {
              quotaHitsOnThisKey += 1
            }
            if (
              attempt === 0 &&
              isQuotaError(error) &&
              !isHardQuotaExhausted(error)
            ) {
              await sleep(retryDelayMs(error))
              continue
            }
            break
          }
        }
      }

      if (quotaHitsOnThisKey > 0) {
        console.error(
          `[api/discovery] ${entry.label} exhausted quota across models — trying next key`,
        )
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
