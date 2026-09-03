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
  canonicalSiteUrlFromText,
  hasExplicitSiteLocator,
  intentFromDeepLocator,
  looksLikeAmbiguousBrandName,
  looksLikeSiteConfirmation,
  looksLikeSiteDecline,
  isSettledPlanApprovalTurn,
  messageRequestsSiteWork,
  summarizeStatedJourneyIntent,
} from './_lib/discoverySiteIntent.js'
import { ensureProposalsHonorStatedIntent } from './_lib/proposalIntentGuard.js'
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
import {
  geminiApiKeysForRequest,
  isFreeTierHardQuota,
  isHardQuotaExhausted,
  isQuotaError,
  logGeminiKeyRoster,
  markFreeTierExhausted,
  retryDelayMs,
} from './_lib/geminiFailover.js'
import {
  computeVerificationSignals,
  parseVerificationDecision,
  resolveVerificationExecution,
  selectStepsForVerification,
  type VerificationSignals,
} from './_lib/verificationPolicy.js'

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
  // Plan already shown — bare approval must not re-crawl or dry-run.
  if (
    isSettledPlanApprovalTurn({
      mode: body.mode,
      userMessage: body.userMessage,
      currentSteps: body.context?.currentSteps ?? null,
    })
  ) {
    return false
  }
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

/**
 * User wants site work but we have no URL after resolve (brand resolve failed, etc.).
 * Ask for URL / precise domain — never ship a Navigate plan to about:blank.
 */
function needsSiteUrlClarification(
  body: DiscoveryAiRequest,
  target: ResolvedSiteTarget | null,
): boolean {
  if (body.mode !== 'bootstrap' && body.mode !== 'chat') return false
  if (!messageRequestsSiteWork(body.userMessage)) return false
  if (looksLikeSiteDecline(body.userMessage)) return false
  if (looksLikeSiteConfirmation(body.userMessage) && body.context?.url) return false
  if (target?.url) return false
  const lang = body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const seed = typeof body.context?.seed === 'string' ? body.context.seed.trim() : ''
  const blob = [seed, body.userMessage].filter(Boolean).join('\n')
  if (canonicalSiteUrlFromText(blob, lang)) return false
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
  const clarifyUrl = needsSiteUrlClarification(body, target)
  const siteUrlPending = confirmFirst || clarifyUrl
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
        pageSnapshot: siteUrlPending
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
        siteExplore: siteUrlPending ? null : siteExplorePromptView(explore),
        // Ambiguous acronym/name: candidate ready — confirm with user before proposals.
        siteConfirmation: siteUrlPending
          ? {
              needed: true,
              candidateUrl: target?.url ?? null,
              candidateLabel: target?.label ?? null,
            }
          : { needed: false },
        /**
         * Facts for browser-verify reasoning — not orders.
         * Model must return `verification` when emitting a ready plan.
         */
        verificationSignals: computeVerificationSignals({
          mode: body.mode,
          userMessage: body.userMessage,
          contextUrl: base.url ?? null,
          targetUrl: analysis?.url ?? target?.url ?? base.url ?? null,
          pageSnapshot: siteUrlPending
            ? null
            : analysis?.snapshot ?? base.pageSnapshot ?? null,
          answers: base.answers ?? null,
          currentSteps: base.currentSteps ?? null,
        }),
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
        verificationSignals: computeVerificationSignals({
          mode: body.mode,
          userMessage: body.userMessage,
          contextUrl: null,
          targetUrl: null,
          pageSnapshot: null,
          answers: base.answers ?? null,
          currentSteps: base.currentSteps ?? null,
        }),
      }

  // After a bare "oui", keep the seed journey ask visible; if they revised in this
  // message, statedJourneyIntent already comes from the latest turn.
  let userMessage =
    !fromLatest &&
    statedJourneyIntent &&
    looksLikeSiteConfirmation(body.userMessage) &&
    !siteUrlPending
      ? `${body.userMessage}\n\n[Original monitoring request — honor for proposals #1]: ${statedJourneyIntent}`
      : body.userMessage

  // Deep URL handling — destination (where) vs stated outcome (what).
  // When the user already stated an outcome, that wins for proposals[0].
  // Bare deep URL alone must NOT be read as “download / submit”.
  const deepFromMessage =
    intentFromDeepLocator(body.userMessage) ?? intentFromDeepLocator(seed)
  const exploreBlocked =
    Boolean(explore && explore.ok === false) ||
    Boolean(
      explore?.pages?.some((p) =>
        /403|forbidden|access denied/i.test(`${p.title ?? ''} ${p.heading ?? ''}`),
      ),
    )
  if (attachSite && !siteUrlPending && deepFromMessage) {
    if (statedJourneyIntent) {
      userMessage = `${userMessage}\n\n[User stated BOTH an outcome and a deep destination. proposals[0] MUST implement the stated outcome — never replace it with homepage availability or “search from homepage”. Lock this exact path as the destination/context]: ${deepFromMessage}`
      if (exploreBlocked) {
        userMessage = `${userMessage}\n\n[HARD] Deep destination explore failed/blocked (e.g. 403). Do NOT ask the user how they usually navigate. Do NOT ask to re-confirm the site (URL was explicit). Return 2–3 proposals NOW for the stated outcome using a natural path from the site homepage (Ressources / search / menus) — mark as hypotheses if nav labels were not observed.`
      }
    } else {
      userMessage = `${userMessage}\n\n[Deep URL = destination page only — lock this exact path. Do NOT infer the monitoring goal from the path slug (e.g. /brochure ≠ download). Return 2–3 proposals for THIS page (e.g. visibility/accessibility, fill fields, fill+submit) — never jump straight to form-param questions]: ${deepFromMessage}`
    }
  } else if (attachSite && !siteUrlPending && statedJourneyIntent) {
    userMessage = `${userMessage}\n\n[Stated journey outcome — proposals[0] MUST match this; never substitute homepage availability]: ${statedJourneyIntent}`
  }

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


export type PlanReviewIntent = 'approve' | 'edit' | 'launch' | 'ask'

function parsePlanReviewIntent(raw: unknown): PlanReviewIntent | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (v === 'approve' || v === 'edit' || v === 'launch' || v === 'ask') return v
  return null
}

function hasSettledPlanSteps(body: DiscoveryAiRequest): boolean {
  return Array.isArray(body.context?.currentSteps) && body.context.currentSteps.length > 0
}

function plansEssentiallySame(
  prior: Array<{ label?: string; action?: string }> | null | undefined,
  next: unknown,
): boolean {
  if (!Array.isArray(prior) || prior.length === 0 || !Array.isArray(next)) return false
  if (prior.length !== next.length) return false
  return prior.every((p, i) => {
    const n = next[i]
    if (!n || typeof n !== 'object') return false
    const step = n as Record<string, unknown>
    const pl = `${p.label ?? ''}`.trim().toLowerCase()
    const nl = `${typeof step.label === 'string' ? step.label : ''}`.trim().toLowerCase()
    const pa = `${p.action ?? ''}`.trim().toLowerCase()
    const na = `${typeof step.action === 'string' ? step.action : ''}`.trim().toLowerCase()
    if (pl && nl && pl === nl) return true
    return Boolean(pa && na && pa === na && pl.slice(0, 28) === nl.slice(0, 28))
  })
}

/**
 * When a plan is already on screen, honor LLM planReviewIntent:
 * approve/launch/ask → drop plan echo + skip dry-run material.
 * Natural language understanding lives in the model; this only enforces the contract.
 */
function applyPlanReviewGate(
  parsed: Record<string, unknown>,
  body: DiscoveryAiRequest,
): Record<string, unknown> {
  let intent = parsePlanReviewIntent(parsed.planReviewIntent)
  if (!hasSettledPlanSteps(body) || !['iterate', 'chat', 'plan'].includes(body.mode)) {
    return { ...parsed, planReviewIntent: intent }
  }

  const nextSteps =
    parsed.plan && typeof parsed.plan === 'object'
      ? (parsed.plan as Record<string, unknown>).steps
      : null
  // Model re-emitted the same plan without declaring intent → treat as approve.
  if (!intent && parsed.readyForPlan && plansEssentiallySame(body.context?.currentSteps, nextSteps)) {
    intent = 'approve'
  }

  if (intent !== 'approve' && intent !== 'launch' && intent !== 'ask') {
    return { ...parsed, planReviewIntent: intent }
  }

  const lang = body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
  trace.push(
    lang === 'fr'
      ? `Revue plan (${intent}) — pas de nouvelle répétition`
      : `Plan review (${intent}) — skipping dry-run`,
  )
  return {
    ...parsed,
    planReviewIntent: intent,
    plan: null,
    readyForPlan: false,
    proposals: null,
    questions: null,
    verification: {
      scope: 'none',
      reason: `planReviewIntent=${intent}`,
      stepIndexes: [],
    },
    workTrace: trace.slice(0, 8),
  }
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
  const keyEntries = apiKeyEntries
  logGeminiKeyRoster(keyEntries, 'relocalize')

  let lastError: unknown
  for (const entry of keyEntries) {
    const genAI = new GoogleGenerativeAI(entry.key)
    const modelCandidates = geminiModelCandidates(entry.tier)
    let quotaHitsOnThisKey = 0
    let skipRemainingModels = false

    for (const modelName of modelCandidates) {
      if (skipRemainingModels) break
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
            if (entry.tier === 'free' && isFreeTierHardQuota(error)) {
              markFreeTierExhausted(error)
              skipRemainingModels = true
              console.error(
                `[api/relocalize] ${entry.label} free-tier hard quota — jumping to next key`,
              )
              break
            }
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
    .filter((s): s is RunnableStep => s != null)
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
  clarifyUrl?: boolean
}): Promise<Record<string, unknown>> {
  const { explore, analysis, target, body, requestStartedAt, sendStatus, confirmFirst, clarifyUrl } =
    options
  let parsed = { ...options.parsed }
  const lang = body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const budgetLeft = () => 55_000 - (Date.now() - requestStartedAt)

  // Never dry-run (or keep a plan) while URL is still unknown or unconfirmed.
  if (confirmFirst || clarifyUrl) {
    return { ...parsed, plan: null, readyForPlan: false, proposals: null }
  }

  // LLM (or structural echo) said approve/launch/ask — never re-rehearse.
  const reviewIntent = parsePlanReviewIntent(parsed.planReviewIntent)
  if (reviewIntent === 'approve' || reviewIntent === 'launch' || reviewIntent === 'ask') {
    return parsed
  }

  // Heuristic word-list approve (legacy fast path) — still skip dry-run.
  if (
    isSettledPlanApprovalTurn({
      mode: body.mode,
      userMessage: body.userMessage,
      currentSteps: body.context?.currentSteps ?? null,
    })
  ) {
    const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
    trace.push(
      lang === 'fr'
        ? 'Plan validé — pas de nouvelle exploration ni répétition'
        : 'Plan approved — skipping re-explore and dry-run',
    )
    return { ...parsed, workTrace: trace.slice(0, 8) }
  }

  if (!parsed.plan || typeof parsed.plan !== 'object' || !parsed.readyForPlan) {
    return parsed
  }

  const seed =
    typeof body.context?.seed === 'string' ? body.context.seed.trim() : ''
  const contextUrl =
    analysis?.url ??
    target?.url ??
    body.context?.url ??
    canonicalSiteUrlFromText(`${seed}\n${body.userMessage}`, lang === 'fr' ? 'fr' : 'en') ??
    null

  const planSteps = Array.isArray((parsed.plan as Record<string, unknown>).steps)
    ? ((parsed.plan as Record<string, unknown>).steps as Array<Record<string, unknown>>)
    : []
  const needsNavigate = planSteps.some(
    (s) =>
      typeof s.action === 'string' &&
      /navigate|go to|open/i.test(s.action) &&
      !/https?:\/\//i.test(`${s.label ?? ''} ${s.href ?? ''}`),
  )
  if (needsNavigate && !contextUrl) {
    const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
    trace.push(
      lang === 'fr'
        ? 'Plan sans URL navigable — précisez le site ou collez un lien'
        : 'Plan has no navigable URL — specify the site or paste a link',
    )
    return {
      ...parsed,
      plan: null,
      readyForPlan: false,
      workTrace: trace.slice(0, 8),
    }
  }

  const grounded = applyGroundingToPlan(
    parsed.plan as Record<string, unknown>,
    explore,
    contextUrl,
    body.userMessage,
  )
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

  const signals: VerificationSignals = computeVerificationSignals({
    mode: body.mode,
    userMessage: body.userMessage,
    contextUrl: body.context?.url ?? null,
    targetUrl: analysis?.url ?? target?.url ?? body.context?.url ?? null,
    pageSnapshot: body.context?.pageSnapshot ?? analysis?.snapshot ?? null,
    answers: body.context?.answers ?? null,
    currentSteps: body.context?.currentSteps ?? null,
  })
  const planObj = parsed.plan as Record<string, unknown>
  const nextSteps = Array.isArray(planObj.steps)
    ? (planObj.steps as Array<{ label?: string; action?: string }>)
    : []
  const resolved = resolveVerificationExecution({
    signals,
    decision: parseVerificationDecision(parsed.verification),
    readyForPlan: true,
    budgetOk: budgetLeft() >= 20_000,
    priorSteps: body.context?.currentSteps ?? null,
    nextSteps,
  })

  // Login gateway clamp: plan Types a password but explore never saw a password field
  // (e.g. eurecia.com/login only has « Je me connecte »). Force a browser check so
  // missing CTA clicks surface before the user runs the journey.
  let resolvedFinal = resolved
  const planTypesSecret = nextSteps.some((step) =>
    /password|mot\s*de\s*passe|passwd|\bpwd\b/i.test(
      `${step.action ?? ''} ${step.label ?? ''}`,
    ),
  )
  const exploreHasPasswordField = Boolean(
    explore?.pages?.some((page) =>
      page.forms.some((form) =>
        form.fields.some((field) => /pass|pwd|mot\s*de\s*passe|motdepasse/i.test(field)),
      ),
    ),
  )
  const snapshotHasPassword =
    typeof body.context?.pageSnapshot === 'string' &&
    /type=["']password["']|mot\s*de\s*passe|password/i.test(body.context.pageSnapshot)
  if (
    resolvedFinal.scope === 'none' &&
    planTypesSecret &&
    !exploreHasPasswordField &&
    !snapshotHasPassword &&
    budgetLeft() >= 20_000
  ) {
    resolvedFinal = {
      scope: 'full',
      reason:
        'Plan types credentials but explore saw no password field — likely a login gateway; verifying full path',
      stepIndexes: [],
      source: 'safety',
    }
  }

  // Echo the resolved policy for debugging / workTrace honesty (not user-facing message).
  parsed.verification = {
    scope: resolvedFinal.scope,
    reason: resolvedFinal.reason,
    stepIndexes: resolvedFinal.stepIndexes,
    source: resolvedFinal.source,
  }

  if (resolvedFinal.scope === 'none') {
    const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
    trace.push(
      lang === 'fr'
        ? `Vérif navigateur : non (${resolvedFinal.reason})`
        : `Browser verify: none (${resolvedFinal.reason})`,
    )
    parsed.workTrace = trace.slice(0, 8)
    return parsed
  }

  const seedUrl = analysis?.url ?? target?.url ?? body.context?.url ?? null
  const runnable = planStepsToRunnable(planObj, seedUrl)
  const selected = selectStepsForVerification(
    runnable,
    resolvedFinal.scope,
    resolvedFinal.stepIndexes,
    8,
  )
  if (selected.length === 0) return parsed

  const rangeLabel =
    resolvedFinal.scope === 'delta' && resolvedFinal.stepIndexes.length > 0
      ? resolvedFinal.stepIndexes.map((i) => i + 1).join(', ')
      : null
  sendStatus(
    lang === 'fr'
      ? rangeLabel
        ? `Je vérifie les étapes ${rangeLabel} dans le navigateur…`
        : 'Je vérifie le parcours dans le navigateur…'
      : rangeLabel
        ? `Checking steps ${rangeLabel} in the browser…`
        : 'Checking the journey in the browser…',
  )

  const dry = await dryRunJourneyWithPlaywright({
    steps: selected,
    prompt:
      typeof planObj.prompt === 'string' ? (planObj.prompt as string) : body.userMessage,
    siteUrl: seedUrl,
    preferredLanguage: lang,
    // End-to-end rehearsal needs more headroom than a quick inventory explore.
    deadlineMs: Math.min(45_000, Math.max(18_000, budgetLeft() - 6_000)),
  })

  const trace = Array.isArray(parsed.workTrace) ? [...parsed.workTrace] : []
  if (dry.ok) {
    trace.push(
      lang === 'fr'
        ? `Répétition OK (${dry.stepsOk} étape${dry.stepsOk > 1 ? 's' : ''}, scope ${resolvedFinal.scope})`
        : `Dry-run OK (${dry.stepsOk} step${dry.stepsOk > 1 ? 's' : ''}, scope ${resolvedFinal.scope})`,
    )
  } else {
    trace.push(
      lang === 'fr'
        ? `Répétition partielle (${resolvedFinal.scope}) — étape ${
            dry.failedIndex != null ? dry.failedIndex + 1 : '?'
          } fragile${dry.error ? ` (${dry.error})` : ''}`
        : `Partial dry-run (${resolvedFinal.scope}) — step ${
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
  clarifyUrl: boolean,
) {
  const siteUrlPending = confirmFirst || clarifyUrl
  const declined = isSiteCandidateDeclined(body)
  // Hard gates: never ship journey proposals while confirming the site, or after the
  // user declined the candidate (e.g. « c'était juste un souhait »).
  let proposals =
    siteUrlPending || declined || !Array.isArray(parsed.proposals) ? null : parsed.proposals
  let questions = declined
    ? null
    : Array.isArray(parsed.questions)
      ? parsed.questions
      : null
  const lang = body.preferredLanguage ?? body.context?.preferredLanguage ?? 'en'
  const fr = lang === 'fr'
  const host = candidateHostLabel(target?.url)

  // Root guard: stated outcome beats homepage / search-from-home templates.
  // Also synthesizes proposals when the model stalls on 403 / asks navigation questions.
  const seed =
    typeof body.context?.seed === 'string' ? body.context.seed.trim() : ''
  const stated =
    summarizeStatedJourneyIntent(body.userMessage) ??
    summarizeStatedJourneyIntent(seed)
  const destinationUrl = analysis?.url ?? target?.url ?? body.context?.url ?? null

  if (!siteUrlPending && !declined) {
    // Drop model-invented site confirmation when the URL was already explicit.
    if (
      questions &&
      (target?.source === 'explicit_url' || target?.source === 'bare_domain')
    ) {
      const filtered = questions.filter((q) => {
        if (!q || typeof q !== 'object') return false
        const prompt = String((q as { prompt?: unknown }).prompt ?? '')
        return !/confirm(?:er)?\s+(?:le\s+)?site|is\s+.+\s+the\s+site|bien\s+sur\s+\w+|site\s+à\s+surveiller|url\s+à\s+surveiller|official\s+site/i.test(
          prompt,
        )
      })
      questions = filtered.length > 0 ? filtered : null
    }
    // Drop “how do you usually navigate?” when the outcome is already stated.
    if (questions && stated) {
      const filtered = questions.filter((q) => {
        if (!q || typeof q !== 'object') return false
        const prompt = String((q as { prompt?: unknown }).prompt ?? '')
        return !/comment\s+tu\s+acc[eè]des|how\s+do\s+you\s+(?:usually\s+)?(?:access|get\s+there|navigate)|section\s+des\s+livres\s+blancs|habituellement/i.test(
          prompt,
        )
      })
      questions = filtered.length > 0 ? filtered : null
    }
  }

  if (!siteUrlPending && !declined && stated) {
    proposals = ensureProposalsHonorStatedIntent(proposals, stated, {
      destinationUrl,
      preferredLanguage: lang,
    })
  } else if (proposals) {
    proposals = ensureProposalsHonorStatedIntent(proposals, null, {
      destinationUrl,
      preferredLanguage: lang,
    })
  }

  // Server-owned URL fact-check UI: always the candidate host + decline.
  // Never ship model-invented alternate hosts as soft options.
  if (clarifyUrl && !declined && !confirmFirst) {
    questions = [
      {
        id: 'site-url',
        prompt: fr
          ? `Je n’ai pas encore d’URL certaine pour ce site. Collez le lien exact à surveiller, ou précisez le domaine (ex. fr.wikipedia.org).`
          : `I don't have a certain URL for this site yet. Paste the exact link to monitor, or give the domain (e.g. en.wikipedia.org).`,
        options: [],
      },
    ]
  }

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
    } else if (clarifyUrl) {
      formTitle = fr ? 'Préciser le site' : 'Specify the site'
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

  const fallbackMessage = clarifyUrl
    ? fr
      ? `Pour construire un parcours rejouable, j’ai besoin de l’URL du site — ou d’un nom assez précis pour que je la déduise.`
      : `To build a replayable journey, I need the site URL — or a precise enough name so I can infer it.`
    : confirmFirst
      ? fr
        ? `J’ai trouvé ${host} comme site officiel. Tu confirmes que c’est bien l’URL à surveiller ?`
        : `I found ${host} as the official site. Confirm this is the URL to monitor?`
      : fr
        ? 'Voici ce que je propose.'
        : 'Here is what I suggest.'

  // While URL is pending, prefer server-owned copy — model may invent hosts.
  const message = siteUrlPending
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
      siteUrlPending || declined
        ? null
        : parsed.plan && typeof parsed.plan === 'object'
          ? parsed.plan
          : null,
    readyForPlan: siteUrlPending || declined ? false : Boolean(parsed.readyForPlan),
    planReviewIntent: parsePlanReviewIntent(parsed.planReviewIntent),
    pageSnapshot:
      siteUrlPending || declined
        ? null
        : analysis?.snapshot ?? body.context?.pageSnapshot ?? null,
    siteTarget: declined ? null : target,
    siteConfirmation: siteUrlPending
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
        : clarifyUrl
          ? {
              ok: false,
              url: '',
              reason: 'awaiting_site_url',
              title: null,
              status: null,
              exploreMethod: null,
              pagesVisited: null,
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

  const apiKeyEntries = geminiApiKeysForRequest()
  if (apiKeyEntries.length === 0) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' })
  }
  logGeminiKeyRoster(apiKeyEntries)

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
    const clarifyUrl = needsSiteUrlClarification(body, target)

    ;({ analysis, explore } = await gatherSiteEvidence(body, target, sendStatus))

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    let lastError: unknown
    for (const entry of apiKeyEntries) {
      const genAI = new GoogleGenerativeAI(entry.key)
      const modelCandidates = geminiModelCandidates(entry.tier)
      let quotaHitsOnThisKey = 0
      let skipRemainingModels = false

      for (const modelName of modelCandidates) {
        if (skipRemainingModels) break
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

            const gated = applyPlanReviewGate(rawParsed, body)
            const parsed = await groundAndMaybeDryRunPlan({
              parsed: gated,
              explore,
              analysis,
              target,
              body,
              requestStartedAt,
              sendStatus,
              confirmFirst,
              clarifyUrl,
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
                clarifyUrl,
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
              if (entry.tier === 'free' && isFreeTierHardQuota(error)) {
                markFreeTierExhausted(error)
                skipRemainingModels = true
                console.error(
                  `[api/discovery] ${entry.label} free-tier hard quota — jumping to next key (paid if configured)`,
                )
                break
              }
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
