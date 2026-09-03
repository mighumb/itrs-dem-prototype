import type { DiscoveryPlan } from '../mock/discovery'
import { isFillFieldsWithoutSubmitAsk } from '../../api/_lib/discoverySiteIntent'
import {
  isBareJourneyLaunch,
  isLocaleNoiseComplaint,
  wantsJourneyLaunch,
  wantsPlanCorrection,
  wantsPlanInChat,
} from '../mock/discovery'
import { t, type Locale } from '../i18n/messages'

export function resolveAgentReplyContent(
  content: string,
  locale: Locale,
  options?: { plan?: DiscoveryPlan | null },
): string {
  const trimmed = content.trim()
  if (trimmed) return trimmed
  if (options?.plan && options.plan.steps.length > 0) return trimmed
  return t(locale, 'agentEmptyReply')
}

export function planStepsForIterate(plan: DiscoveryPlan) {
  return plan.steps.map((step, index) => ({
    id: `plan-step-${index + 1}`,
    label: step.label,
    action: step.action,
  }))
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export type IterateWorkspacePlanIntent = {
  showPlan: boolean
  correctPlan: boolean
  editSteps: boolean
  newSiteOrJourney: boolean
  localeNoiseFix: boolean
  launchWithEdits: boolean
}

/** Classify when the workspace user expects a plan change or re-display — not casual Q&A. */
export function classifyIterateWorkspacePlanIntent(
  userMessage: string,
  seedUrl?: string | null,
): IterateWorkspacePlanIntent {
  const text = userMessage.trim()
  const lower = text.toLowerCase()
  const showPlan = wantsPlanInChat(text)
  const correctPlan = wantsPlanCorrection(text) || isFillFieldsWithoutSubmitAsk(text)
  const localeNoiseFix = isLocaleNoiseComplaint(text)

  const editSteps =
    correctPlan ||
    /\b(ajout(e|er)?|add( an?)? (step|action)|supprim(e|er)?|remove (step|action)|modifi(e|er)?|change[r]? (l[''])?(étape|action|step)|insert|reorder|r[eé]ordonn|remplace[r]?|swap|d[eé]place[r]?)\b/i.test(
      text,
    )

  const existingHost = hostOf(seedUrl ?? null)
  const urlsInMessage = text.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  const messageMentionsOtherHost = urlsInMessage.some((raw) => {
    const host = hostOf(raw.replace(/[.,);]+$/g, ''))
    if (!host) return false
    if (existingHost && host === existingHost) return false
    return true
  })

  const newSiteOrJourney =
    messageMentionsOtherHost ||
    /\b(autre site|new (site|url|domain)|change[r]? (d[''])?(url|site)|bascul|switch (to )?site|nouveau parcours|new journey|recommenc|from scratch|reparti?r (de z[eé]ro|à z[eé]ro)|tout chang|change everything)\b/i.test(
      lower,
    )

  const launchIntent = wantsJourneyLaunch(text)
  const launchWithEdits =
    launchIntent &&
    !isBareJourneyLaunch(text) &&
    (editSteps || correctPlan || newSiteOrJourney)

  return {
    showPlan,
    correctPlan,
    editSteps,
    newSiteOrJourney,
    localeNoiseFix,
    launchWithEdits,
  }
}

/** Bind a model-returned plan to the workspace — block unsolicited plan dumps on Q&A turns. */
export function shouldBindIterateAiPlan(
  userMessage: string,
  _ai: { readyForPlan: boolean },
  seedUrl?: string | null,
): boolean {
  const intent = classifyIterateWorkspacePlanIntent(userMessage, seedUrl)
  return (
    intent.showPlan ||
    intent.correctPlan ||
    intent.editSteps ||
    intent.newSiteOrJourney ||
    intent.localeNoiseFix ||
    intent.launchWithEdits
  )
}

export function shouldApplyIteratePlanToWorkspace(
  userMessage: string,
  resolvedPlan: DiscoveryPlan | null,
  options: {
    seedUrl?: string | null
    boundModelPlan: boolean
    localLocaleClean: boolean
  },
): boolean {
  if (!resolvedPlan) return false
  const intent = classifyIterateWorkspacePlanIntent(userMessage, options.seedUrl)
  if (options.localLocaleClean) return true
  if (intent.correctPlan || intent.editSteps || intent.newSiteOrJourney || intent.launchWithEdits) {
    return true
  }
  // Re-display only — show in chat, do not mutate the Steps panel.
  if (intent.showPlan) return false
  if (options.boundModelPlan) return true
  return false
}

/** Home planning phase — same intent gate as workspace iterate. */
export const shouldBindPlanningAiPlan = shouldBindIterateAiPlan

export function appendDryRunWarning(
  message: string,
  workTrace: string[] | null | undefined,
  locale: Locale,
): string {
  const trace = (workTrace ?? []).join(' ')
  if (!/dry-run|dry run|répétition partielle|partial dry-run|fragile/i.test(trace)) {
    return message
  }
  const notice = t(locale, 'dryRunPartialWarning')
  const trimmed = message.trim()
  return trimmed ? `${trimmed}\n\n${notice}` : notice
}

export function appendPlanNotAppliedHint(
  message: string,
  userMessage: string,
  boundModelPlan: boolean,
  locale: Locale,
): string {
  if (boundModelPlan) return message
  const intent = classifyIterateWorkspacePlanIntent(userMessage)
  if (!intent.editSteps && !intent.correctPlan) return message
  const hint = t(locale, 'planNotAppliedHint')
  const trimmed = message.trim()
  return trimmed ? `${trimmed}\n\n${hint}` : hint
}

export function planStepCountDeltaNotice(
  locale: Locale,
  before: number,
  after: number,
): string | null {
  if (before === after) return null
  return t(locale, before < after ? 'planStepsAdded' : 'planStepsRemoved').replace(
    '{delta}',
    String(Math.abs(after - before)),
  )
}

export function wantsApplyPlanToPanel(text: string): boolean {
  return /\b(applique[rz]?|apply|commit|update the (journey )?plan|mets? (à jour )?(le )?plan|mettre à jour (le )?plan)\b/i.test(
    text.trim(),
  )
}

export function formatWorkspacePlanIntro(
  locale: Locale,
  kind: 'patched' | 'sync' | 'localeClean' | 'formPatch' | 'showPlan',
): string {
  switch (kind) {
    case 'patched':
      return t(locale, 'workspacePlanPatchedIntro')
    case 'sync':
      return t(locale, 'workspacePlanSyncIntro')
    case 'localeClean':
      return t(locale, 'workspacePlanLocaleCleanIntro')
    case 'formPatch':
      return t(locale, 'workspacePlanFormPatchIntro')
    case 'showPlan':
      return t(locale, 'workspacePlanShowIntro')
  }
}

