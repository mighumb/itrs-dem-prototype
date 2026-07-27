import { tf, type Locale } from '../i18n/messages'
import type { JourneyAction, JourneyStage, StepStatus } from '../types'

export function newStageId(prefix = 'stage'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function newActionId(prefix = 'action'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Default stage title: "Stage 1" / "Étape 1". Users can rename manually. */
export function defaultStageTitle(indexZeroBased: number, locale: Locale = 'en'): string {
  return tf(locale, 'stageN', { n: indexZeroBased + 1 })
}

/**
 * Default product rule: 1 action = 1 stage.
 * Stage titles are numbered (Étape N), not copies of the action label.
 */
export function actionsToStages(
  actions: Array<Omit<JourneyAction, 'status'> & { status?: StepStatus }>,
  locale: Locale = 'en',
): JourneyStage[] {
  return actions.map((action, index) => ({
    id: `stage-${action.id || index + 1}`,
    title: defaultStageTitle(index, locale),
    actions: [
      {
        ...action,
        status: action.status ?? 'pending',
      },
    ],
  }))
}

export function flattenActions(stages: JourneyStage[]): JourneyAction[] {
  return stages.flatMap((stage) => stage.actions)
}

export function countActions(stages: JourneyStage[]): number {
  return stages.reduce((n, stage) => n + stage.actions.length, 0)
}

export function findAction(
  stages: JourneyStage[],
  actionId: string,
): { stageIndex: number; actionIndex: number; stage: JourneyStage; action: JourneyAction } | null {
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const stage = stages[stageIndex]!
    const actionIndex = stage.actions.findIndex((a) => a.id === actionId)
    if (actionIndex >= 0) {
      return { stageIndex, actionIndex, stage, action: stage.actions[actionIndex]! }
    }
  }
  return null
}

export function mapActions(
  stages: JourneyStage[],
  mapFn: (action: JourneyAction, stage: JourneyStage) => JourneyAction,
): JourneyStage[] {
  return stages.map((stage) => ({
    ...stage,
    actions: stage.actions.map((action) => mapFn(action, stage)),
  }))
}

export function patchAction(
  stages: JourneyStage[],
  actionId: string,
  patch: Partial<JourneyAction>,
): JourneyStage[] {
  return mapActions(stages, (action) => (action.id === actionId ? { ...action, ...patch } : action))
}

export function replaceAction(
  stages: JourneyStage[],
  actionId: string,
  nextAction: JourneyAction,
): JourneyStage[] {
  return mapActions(stages, (action) => (action.id === actionId ? nextAction : action))
}

export function resetActionStatuses(stages: JourneyStage[], status: StepStatus = 'pending'): JourneyStage[] {
  return mapActions(stages, (action) => ({ ...action, status }))
}

/** Aggregate status for a stage header (empty → pending). */
export function stageStatus(stage: JourneyStage): StepStatus {
  const { actions } = stage
  if (actions.length === 0) return 'pending'
  if (actions.some((a) => a.status === 'running')) return 'running'
  if (actions.some((a) => a.status === 'failed')) return 'failed'
  if (actions.every((a) => a.status === 'done')) return 'done'
  return 'pending'
}

export function createEmptyStage(title: string): JourneyStage {
  return {
    id: newStageId(),
    title,
    actions: [],
  }
}

export function createDefaultStageWithAction(options: {
  title: string
  action: Omit<JourneyAction, 'id' | 'status'> & { id?: string; status?: StepStatus }
}): JourneyStage {
  const actionId = options.action.id ?? newActionId()
  return {
    id: newStageId(),
    title: options.title,
    actions: [
      {
        ...options.action,
        id: actionId,
        status: options.action.status ?? 'pending',
      },
    ],
  }
}

export function moveAction(
  stages: JourneyStage[],
  fromStageIndex: number,
  fromActionIndex: number,
  toStageIndex: number,
  toActionIndex: number,
): JourneyStage[] {
  if (
    fromStageIndex < 0 ||
    toStageIndex < 0 ||
    fromStageIndex >= stages.length ||
    toStageIndex >= stages.length
  ) {
    return stages
  }

  const next = stages.map((stage) => ({ ...stage, actions: [...stage.actions] }))
  const fromStage = next[fromStageIndex]!
  const [moved] = fromStage.actions.splice(fromActionIndex, 1)
  if (!moved) return stages

  const toStage = next[toStageIndex]!
  const insertAt = Math.max(0, Math.min(toActionIndex, toStage.actions.length))
  toStage.actions.splice(insertAt, 0, moved)
  return next
}

export function reorderStages(stages: JourneyStage[], from: number, to: number): JourneyStage[] {
  if (from === to || from < 0 || to < 0 || from >= stages.length || to >= stages.length) {
    return stages
  }
  const next = [...stages]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

export function reorderActionsInStage(
  stages: JourneyStage[],
  stageIndex: number,
  from: number,
  to: number,
): JourneyStage[] {
  if (stageIndex < 0 || stageIndex >= stages.length || from === to) return stages
  const stage = stages[stageIndex]!
  if (from < 0 || to < 0 || from >= stage.actions.length || to >= stage.actions.length) {
    return stages
  }
  const actions = [...stage.actions]
  const [moved] = actions.splice(from, 1)
  actions.splice(to, 0, moved!)
  return stages.map((s, i) => (i === stageIndex ? { ...s, actions } : s))
}
