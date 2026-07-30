/**
 * Context-aware browser verification policy for Discovery plan turns.
 *
 * Design:
 * - Deterministic *signals* describe the situation (facts, not a final verdict).
 * - The LLM returns a structured *decision* (scope + reason + optional step indexes).
 * - The server *resolves* an executable scope with light safety clamps only when the
 *   model omits a decision or clearly contradicts hard facts (e.g. new URL + "none").
 *
 * Scopes:
 * - none  — reuse prior explore / grounding; no Playwright dry-run
 * - delta — rehearse only the touched window of steps
 * - full  — rehearse the plan (capped) in the browser
 */

export type VerificationScope = 'none' | 'delta' | 'full'

export type PlanStepLike = {
  label?: string
  action?: string
}

export type VerificationSignals = {
  mode: string
  hasPriorExplore: boolean
  urlChanged: boolean
  hasAnswers: boolean
  priorStepCount: number | null
  userAskedExplicitVerify: boolean
  changeHints: {
    newUrlOrSite: boolean
    editOrAddStep: boolean
    paramsOrAnswersOnly: boolean
    replaceWholeJourney: boolean
  }
  /** Soft suggestion for the model — not an order. */
  suggestedScope: VerificationScope
  suggestedReason: string
}

export type VerificationDecision = {
  scope: VerificationScope
  reason: string
  /** 0-based indexes into the new plan when scope is delta. */
  stepIndexes: number[]
}

export type ResolvedVerification = VerificationDecision & {
  source: 'llm' | 'signals' | 'safety'
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    const bare = url.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0]
    return bare ? bare.toLowerCase() : null
  }
}

function classifyUserChangeHints(
  userMessage: string,
  existingUrl?: string | null,
): VerificationSignals['changeHints'] & {
  userAskedExplicitVerify: boolean
} {
  const text = userMessage.trim()
  const lower = text.toLowerCase()

  const userAskedExplicitVerify =
    /\b(v[eé]rifie|v[eé]rifier|re[- ]?v[eé]rif|check( the)?( journey| steps| plan)?|dry[- ]?run|rehearse|teste? (le )?parcours)\b/i.test(
      text,
    )

  const existingHost = hostOf(existingUrl)
  const urlsInMessage = text.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  const messageMentionsOtherHost = urlsInMessage.some((raw) => {
    const host = hostOf(raw.replace(/[.,);]+$/g, ''))
    if (!host) return false
    // Same host as the known destination → not a site switch (plan prompts often restate the URL).
    if (existingHost && host === existingHost) return false
    return true
  })

  const newUrlOrSite =
    messageMentionsOtherHost ||
    /\b(autre site|new (site|url|domain)|change[r]? (d['’])?(url|site)|bascul|switch (to )?site)\b/i.test(
      lower,
    )

  const editOrAddStep =
    /\b(ajout(e|er)?|add( an?)? (step|action)|supprim(e|er)?|remove (step|action)|modifi(e|er)?|change[r]? (l['’])?(étape|action|step)|insert|reorder|r[eé]ordonn)/i.test(
      text,
    )

  const replaceWholeJourney =
    /\b(recommenc|from scratch|nouveau parcours|new journey|tout chang|change everything|reparti?r (de z[eé]ro|à z[eé]ro))\b/i.test(
      lower,
    )

  const paramsOrAnswersOnly =
    !newUrlOrSite &&
    !editOrAddStep &&
    !replaceWholeJourney &&
    !userAskedExplicitVerify

  return {
    userAskedExplicitVerify,
    newUrlOrSite,
    editOrAddStep,
    paramsOrAnswersOnly,
    replaceWholeJourney,
  }
}

function suggestFromSignals(input: {
  hasPriorExplore: boolean
  urlChanged: boolean
  hasAnswers: boolean
  mode: string
  hints: ReturnType<typeof classifyUserChangeHints>
}): Pick<VerificationSignals, 'suggestedScope' | 'suggestedReason'> {
  const { hasPriorExplore, urlChanged, mode, hints } = input

  if (hints.userAskedExplicitVerify) {
    return {
      suggestedScope: hints.editOrAddStep ? 'delta' : 'full',
      suggestedReason: 'User explicitly asked to verify / check the journey',
    }
  }
  if (urlChanged || hints.newUrlOrSite || hints.replaceWholeJourney) {
    return {
      suggestedScope: 'full',
      suggestedReason: 'Destination or whole journey changed — rehearse the full path',
    }
  }
  if (hints.editOrAddStep && mode === 'iterate') {
    return {
      suggestedScope: 'delta',
      suggestedReason: 'Structural step edit on an existing plan — verify the affected window',
    }
  }
  // Default for a ready plan: execute every step in Playwright (explore ≠ journey verify).
  return {
    suggestedScope: 'full',
    suggestedReason: hasPriorExplore
      ? 'Ready plan — rehearse each action end-to-end (inventory explore is not enough)'
      : 'No prior page evidence — first end-to-end browser rehearsal',
  }
}

export function computeVerificationSignals(options: {
  mode: string
  userMessage: string
  contextUrl?: string | null
  targetUrl?: string | null
  pageSnapshot?: string | null
  answers?: Record<string, string> | null
  currentSteps?: PlanStepLike[] | null
}): VerificationSignals {
  const hasPriorExplore =
    typeof options.pageSnapshot === 'string' && options.pageSnapshot.trim().length > 0
  const ctxHost = hostOf(options.contextUrl)
  const targetHost = hostOf(options.targetUrl)
  const urlChanged = Boolean(
    ctxHost && targetHost && ctxHost !== targetHost,
  )
  const answers = options.answers ?? {}
  const hasAnswers = Object.values(answers).some((v) => String(v ?? '').trim().length > 0)
  const hints = classifyUserChangeHints(options.userMessage, options.contextUrl)
  const suggestion = suggestFromSignals({
    hasPriorExplore,
    urlChanged,
    hasAnswers,
    mode: options.mode,
    hints,
  })

  return {
    mode: options.mode,
    hasPriorExplore,
    urlChanged,
    hasAnswers,
    priorStepCount: Array.isArray(options.currentSteps) ? options.currentSteps.length : null,
    userAskedExplicitVerify: hints.userAskedExplicitVerify,
    changeHints: {
      newUrlOrSite: hints.newUrlOrSite,
      editOrAddStep: hints.editOrAddStep,
      paramsOrAnswersOnly: hints.paramsOrAnswersOnly,
      replaceWholeJourney: hints.replaceWholeJourney,
    },
    suggestedScope: suggestion.suggestedScope,
    suggestedReason: suggestion.suggestedReason,
  }
}

export function parseVerificationDecision(raw: unknown): VerificationDecision | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const scopeRaw = typeof obj.scope === 'string' ? obj.scope.trim().toLowerCase() : ''
  if (scopeRaw !== 'none' && scopeRaw !== 'delta' && scopeRaw !== 'full') return null
  const reason =
    typeof obj.reason === 'string' && obj.reason.trim()
      ? obj.reason.trim().slice(0, 240)
      : 'Model decision'
  const stepIndexes = Array.isArray(obj.stepIndexes)
    ? obj.stepIndexes
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0)
        .map((n) => Math.floor(n))
        .slice(0, 12)
    : []
  return { scope: scopeRaw, reason, stepIndexes }
}

/** Diff prior vs new plan labels/actions to recover delta indexes when the model omits them. */
export function inferChangedStepIndexes(
  prior: PlanStepLike[] | null | undefined,
  next: PlanStepLike[] | null | undefined,
): number[] {
  if (!Array.isArray(next) || next.length === 0) return []
  if (!Array.isArray(prior) || prior.length === 0) {
    return next.map((_, i) => i)
  }
  const changed: number[] = []
  const max = Math.max(prior.length, next.length)
  for (let i = 0; i < max; i++) {
    const a = prior[i]
    const b = next[i]
    if (!a || !b) {
      changed.push(i)
      continue
    }
    const al = `${a.action ?? ''}`.trim().toLowerCase()
    const bl = `${b.action ?? ''}`.trim().toLowerCase()
    const at = `${a.label ?? ''}`.trim().toLowerCase()
    const bt = `${b.label ?? ''}`.trim().toLowerCase()
    if (al !== bl || at !== bt) changed.push(i)
  }
  return changed
}

/**
 * Resolve what Playwright should do. LLM wins when coherent; light safety only.
 */
export function resolveVerificationExecution(options: {
  signals: VerificationSignals
  decision: VerificationDecision | null
  readyForPlan: boolean
  budgetOk: boolean
  priorSteps?: PlanStepLike[] | null
  nextSteps?: PlanStepLike[] | null
}): ResolvedVerification {
  const { signals, decision, readyForPlan, budgetOk } = options

  if (!readyForPlan || !budgetOk) {
    return {
      scope: 'none',
      reason: !budgetOk ? 'Skipped verify — time budget too low' : 'No ready plan to verify',
      stepIndexes: [],
      source: 'safety',
    }
  }

  let scope: VerificationScope = decision?.scope ?? signals.suggestedScope
  let reason = decision?.reason ?? signals.suggestedReason
  let source: ResolvedVerification['source'] = decision ? 'llm' : 'signals'
  let stepIndexes = decision?.stepIndexes ?? []

  // Safety: never skip a browser check when the destination clearly changed.
  if (
    scope === 'none' &&
    (signals.urlChanged || signals.changeHints.newUrlOrSite || signals.changeHints.replaceWholeJourney)
  ) {
    scope = 'full'
    reason = `${reason} — upgraded to full because the site/journey target changed`
    source = 'safety'
  }

  // Ready plan → always rehearse actions. Explore only inventories pages; it does not
  // click the journey. Skipping dry-run left login gateways (CTA before form) unverified.
  if (scope === 'none' && readyForPlan) {
    scope = signals.changeHints.editOrAddStep && signals.mode === 'iterate' ? 'delta' : 'full'
    reason =
      'Ready plan must be rehearsed step-by-step in Playwright before Lancer (explore ≠ verify)'
    source = 'safety'
  }

  // Explicit user ask to verify should not be silently dropped.
  if (scope === 'none' && signals.userAskedExplicitVerify) {
    scope = signals.changeHints.editOrAddStep ? 'delta' : 'full'
    reason = 'User asked to verify — honoring explicit request'
    source = 'safety'
  }

  if (scope === 'delta') {
    if (stepIndexes.length === 0) {
      stepIndexes = inferChangedStepIndexes(options.priorSteps, options.nextSteps)
    }
    if (stepIndexes.length === 0) {
      // Delta without indexes → narrow full (better than pretending we know the window).
      scope = 'full'
      reason = `${reason} — no stepIndexes available, using full`
      source = 'safety'
    }
  }

  if (scope === 'none') {
    stepIndexes = []
  }

  return { scope, reason, stepIndexes, source }
}

/** Pick runnable steps for the chosen scope. Delta keeps a small reachability prefix. */
export function selectStepsForVerification<T>(
  steps: T[],
  scope: VerificationScope,
  stepIndexes: number[],
  maxSteps = 8,
): T[] {
  if (scope === 'none' || steps.length === 0) return []
  if (scope === 'full') return steps.slice(0, maxSteps)

  const valid = stepIndexes.filter((i) => i >= 0 && i < steps.length)
  if (valid.length === 0) return steps.slice(0, maxSteps)

  const start = Math.min(...valid)
  const end = Math.max(...valid)
  // Include one step before the first change so Click/Type often has page context.
  const from = Math.max(0, start - 1)
  return steps.slice(from, end + 1).slice(0, maxSteps)
}
