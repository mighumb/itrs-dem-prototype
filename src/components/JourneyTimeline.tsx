import {
  ChevronDown,
  ChevronRight,
  Globe,
  GripVertical,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Type,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import {
  createEmptyStage,
  moveAction,
  newActionId,
  reorderStages,
  stageStatus,
} from '../lib/journeyStages'
import { defaultStepDurationForAction } from '../mock/data'
import type { JourneyAction, JourneyStage } from '../types'

const ACTION_ICONS: Record<string, typeof Globe> = {
  Navigate: Globe,
  Click: MousePointerClick,
  Type: Type,
  Verify: ShieldCheck,
}

const ACTION_OPTIONS = ['Navigate', 'Click', 'Type', 'Verify'] as const

const DEFAULT_STEP_TIMEOUT = '30s'

const CHECKBOX_SLOT = 'flex w-7 shrink-0 items-center justify-center'
const GRIP_SLOT = 'flex shrink-0 items-center px-1'

type DragPayload =
  | { kind: 'stage'; stageIndex: number }
  | { kind: 'action'; stageIndex: number; actionIndex: number }

function defaultTargetForAction(action: string, label: string): string {
  switch (action) {
    case 'Navigate':
      return 'https://example.com'
    case 'Click':
      return `[data-testid="${label.toLowerCase().replace(/\s+/g, '-')}"]`
    case 'Type':
      return 'input[type="text"]'
    case 'Verify':
      return `text="${label}"`
    default:
      return label
  }
}

function defaultTimeoutForAction(_action?: string): string {
  return DEFAULT_STEP_TIMEOUT
}

interface JourneyTimelineProps {
  stages: JourneyStage[]
  compact?: boolean
  editMode?: boolean
  onStagesChange?: (stages: JourneyStage[]) => void
  onActionClick?: (action: JourneyAction) => void
}

export default function JourneyTimeline({
  stages,
  editMode = false,
  onStagesChange,
  onActionClick,
}: JourneyTimelineProps) {
  const { t, tf } = useLocale()
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [checkedActionIds, setCheckedActionIds] = useState<Set<string>>(new Set())
  const [checkedStageIds, setCheckedStageIds] = useState<Set<string>>(new Set())
  const [expandedTech, setExpandedTech] = useState<string | null>(null)
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set())
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [dropStageIndex, setDropStageIndex] = useState<number | null>(null)
  const [dropActionTarget, setDropActionTarget] = useState<{
    stageIndex: number
    actionIndex: number
  } | null>(null)
  const runningActionRef = useRef<HTMLLIElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const canEdit = editMode && !!onStagesChange
  const allActions = stages.flatMap((s) => s.actions)

  useEffect(() => {
    if (!editMode) {
      setCheckedActionIds(new Set())
      setCheckedStageIds(new Set())
      setSelectedActionId(null)
      setSelectedStageId(null)
      setExpandedTech(null)
    }
  }, [editMode])

  useEffect(() => {
    const validActions = new Set(allActions.map((a) => a.id))
    const validStages = new Set(stages.map((s) => s.id))
    setCheckedActionIds((prev) => {
      const next = new Set([...prev].filter((id) => validActions.has(id)))
      return next.size === prev.size ? prev : next
    })
    setCheckedStageIds((prev) => {
      const next = new Set([...prev].filter((id) => validStages.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [stages, allActions])

  const allActionsSelected = allActions.length > 0 && checkedActionIds.size === allActions.length
  const someActionsSelected = checkedActionIds.size > 0 && !allActionsSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someActionsSelected
    }
  }, [someActionsSelected])

  useEffect(() => {
    if (allActions.some((a) => a.status === 'running')) {
      runningActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [allActions])

  if (stages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-zinc-400">{t('stepsWillAppear')}</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              const stage = createEmptyStage(tf('stageN', { n: 1 }))
              onStagesChange?.([stage])
              setSelectedStageId(stage.id)
            }}
            className="cursor-pointer rounded-xl border border-dashed border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400"
          >
            {t('addStage')}
          </button>
        )}
      </div>
    )
  }

  const updateAction = (actionId: string, patch: Partial<JourneyAction>) => {
    if (!onStagesChange) return
    onStagesChange(
      stages.map((stage) => ({
        ...stage,
        actions: stage.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
      })),
    )
  }

  const updateStageTitle = (stageId: string, title: string) => {
    if (!onStagesChange) return
    onStagesChange(stages.map((s) => (s.id === stageId ? { ...s, title } : s)))
  }

  const addStage = () => {
    if (!onStagesChange) return
    const stage = createEmptyStage(tf('stageN', { n: stages.length + 1 }))
    onStagesChange([...stages, stage])
    setSelectedStageId(stage.id)
    setSelectedActionId(null)
  }

  const addActionToStage = (stageIndex: number) => {
    if (!onStagesChange) return
    const label = t('newAction')
    const action: JourneyAction = {
      id: newActionId(),
      label,
      action: 'Click',
      status: 'pending',
      duration: defaultStepDurationForAction('Click'),
      target: defaultTargetForAction('Click', label),
      timeout: defaultTimeoutForAction('Click'),
    }
    onStagesChange(
      stages.map((stage, i) =>
        i === stageIndex ? { ...stage, actions: [...stage.actions, action] } : stage,
      ),
    )
    setSelectedActionId(action.id)
    setSelectedStageId(null)
    setCollapsedStages((prev) => {
      const next = new Set(prev)
      next.delete(stages[stageIndex]!.id)
      return next
    })
  }

  const toggleCheckedAction = (id: string) => {
    setCheckedActionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCheckedStage = (id: string) => {
    const stage = stages.find((s) => s.id === id)
    const actionIds = stage?.actions.map((a) => a.id) ?? []
    const selecting = !checkedStageIds.has(id)

    setCheckedStageIds((prev) => {
      const next = new Set(prev)
      if (selecting) next.add(id)
      else next.delete(id)
      return next
    })

    // Selecting a stage also selects all actions inside it; deselect clears them.
    setCheckedActionIds((prev) => {
      const next = new Set(prev)
      for (const actionId of actionIds) {
        if (selecting) next.add(actionId)
        else next.delete(actionId)
      }
      return next
    })
  }

  const toggleSelectAllActions = () => {
    if (allActionsSelected) setCheckedActionIds(new Set())
    else setCheckedActionIds(new Set(allActions.map((a) => a.id)))
  }

  const deleteSelected = () => {
    if (!onStagesChange) return
    let next = stages
      .filter((s) => !checkedStageIds.has(s.id))
      .map((stage) => ({
        ...stage,
        actions: stage.actions.filter((a) => !checkedActionIds.has(a.id)),
      }))
    onStagesChange(next)
    setCheckedActionIds(new Set())
    setCheckedStageIds(new Set())
    setSelectedActionId(null)
    setSelectedStageId(null)
  }

  const deleteStage = (stageId: string) => {
    if (!onStagesChange) return
    onStagesChange(stages.filter((s) => s.id !== stageId))
    setCheckedStageIds((prev) => {
      const next = new Set(prev)
      next.delete(stageId)
      return next
    })
    setSelectedStageId((id) => (id === stageId ? null : id))
  }

  const deleteAction = (actionId: string) => {
    if (!onStagesChange) return
    onStagesChange(
      stages.map((stage) => ({
        ...stage,
        actions: stage.actions.filter((a) => a.id !== actionId),
      })),
    )
    setCheckedActionIds((prev) => {
      const next = new Set(prev)
      next.delete(actionId)
      return next
    })
    setSelectedActionId((id) => (id === actionId ? null : id))
  }

  const clearDrop = () => {
    setDropStageIndex(null)
    setDropActionTarget(null)
  }

  const handleDropOnStage = (targetStageIndex: number) => {
    if (!onStagesChange || !dragPayload) return
    if (dragPayload.kind === 'stage') {
      onStagesChange(reorderStages(stages, dragPayload.stageIndex, targetStageIndex))
    } else {
      // Drop action onto stage → append (or insert at end)
      onStagesChange(
        moveAction(
          stages,
          dragPayload.stageIndex,
          dragPayload.actionIndex,
          targetStageIndex,
          stages[targetStageIndex]!.actions.length,
        ),
      )
    }
    setDragPayload(null)
    clearDrop()
  }

  const handleDropOnAction = (targetStageIndex: number, targetActionIndex: number) => {
    if (!onStagesChange || !dragPayload || dragPayload.kind !== 'action') return
    onStagesChange(
      moveAction(
        stages,
        dragPayload.stageIndex,
        dragPayload.actionIndex,
        targetStageIndex,
        targetActionIndex,
      ),
    )
    setDragPayload(null)
    clearDrop()
  }

  const checkboxClass =
    'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-300 text-[#0071e3] focus:ring-[#0071e3]/30'

  const selectedCount = checkedActionIds.size + checkedStageIds.size
  const deleteLabel =
    selectedCount === 0
      ? t('delete')
      : selectedCount === stages.length + allActions.length
        ? t('deleteAll')
        : tf('deleteCount', { count: selectedCount })

  const renderActionBadge = (
    Icon: typeof Globe,
    isRunning: boolean,
    isDone: boolean,
    isFailed: boolean,
  ) => (
    <div
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
        isRunning
          ? 'bg-[#0071e3] text-white'
          : isDone
            ? 'bg-emerald-100 text-emerald-700'
            : isFailed
              ? 'bg-red-100 text-red-600'
              : 'bg-zinc-100 text-zinc-500'
      }`}
    >
      {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
    </div>
  )

  const stageBorderClass = (opts: {
    isDropTarget: boolean
    isChecked: boolean
    isSelected: boolean
    status: ReturnType<typeof stageStatus>
  }) => {
    if (opts.isDropTarget) return 'border-[#0071e3] border-dashed bg-[#0071e3]/5'
    if (opts.isChecked) return 'border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/30'
    if (opts.isSelected) return 'border-[#0071e3]/40 bg-[#0071e3]/5'
    if (opts.status === 'running') return 'border-[#0071e3]/30 bg-[#0071e3]/5'
    if (opts.status === 'failed') return 'border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/30'
    return 'border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-700/80 dark:bg-zinc-900/60'
  }

  const actionCardClass = (opts: {
    isDropTarget: boolean
    isChecked: boolean
    isSelected: boolean
    isRunning: boolean
    isFailed: boolean
  }) => {
    if (opts.isDropTarget) return 'border-[#0071e3] border-dashed bg-[#0071e3]/5'
    if (opts.isChecked) return 'border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/30'
    if (opts.isSelected) return 'border-[#0071e3]/40 bg-[#0071e3]/5'
    if (opts.isRunning) return 'border-[#0071e3]/30 bg-[#0071e3]/5'
    if (opts.isFailed) return 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/30'
    return 'border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-700/80 dark:bg-zinc-900 dark:hover:border-zinc-600'
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
      {canEdit && (
        <div className="mb-2 flex min-h-9 items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 py-2 pl-2.5 pr-3 dark:border-zinc-700/80 dark:bg-zinc-800/50">
          <label className={`${CHECKBOX_SLOT} cursor-pointer`} title={t('selectAllActions')}>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allActionsSelected}
              onChange={toggleSelectAllActions}
              className={checkboxClass}
            />
          </label>
          <span className="min-w-0 flex-1 text-left text-[11px] font-medium leading-none text-zinc-600 dark:text-zinc-400">
            {t('selectAllActions')}
          </span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={selectedCount === 0}
            title={deleteLabel}
            className="flex shrink-0 cursor-pointer items-center rounded-md px-1 text-[11px] font-medium leading-none text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleteLabel}
          </button>
        </div>
      )}

      <ol className="space-y-3">
        {stages.map((stage, stageIndex) => {
          const status = stageStatus(stage)
          const isCollapsed = collapsedStages.has(stage.id)
          const isStageSelected = canEdit && selectedStageId === stage.id
          const isStageChecked = checkedStageIds.has(stage.id)
          const isStageDrop =
            dropStageIndex === stageIndex &&
            dragPayload !== null &&
            !(dragPayload.kind === 'stage' && dragPayload.stageIndex === stageIndex)

          return (
            <li
              key={stage.id}
              className={`animate-fade-in rounded-xl border ${stageBorderClass({
                isDropTarget: isStageDrop && dragPayload?.kind === 'stage',
                isChecked: isStageChecked,
                isSelected: isStageSelected,
                status,
              })}`}
              onDragOver={(e) => {
                if (!canEdit || !dragPayload) return
                e.preventDefault()
                if (dragPayload.kind === 'stage') setDropStageIndex(stageIndex)
                else {
                  setDropStageIndex(stageIndex)
                  setDropActionTarget(null)
                }
              }}
              onDragLeave={() => {
                if (dropStageIndex === stageIndex) setDropStageIndex(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (dragPayload?.kind === 'stage' || (dragPayload?.kind === 'action' && !dropActionTarget)) {
                  handleDropOnStage(stageIndex)
                }
              }}
            >
              {/* Stage header */}
              <div className={`flex min-h-9 items-center ${canEdit ? 'pl-2.5 pr-1' : 'px-2'}`}>
                {canEdit && (
                  <label
                    className={`${CHECKBOX_SLOT} cursor-pointer`}
                    title={t('selectStage')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isStageChecked}
                      onChange={() => toggleCheckedStage(stage.id)}
                      className={checkboxClass}
                    />
                  </label>
                )}

                {canEdit && (
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDragPayload({ kind: 'stage', stageIndex })
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setDragPayload(null)
                      clearDrop()
                    }}
                    className={`${GRIP_SLOT} cursor-grab touch-none text-zinc-300 active:cursor-grabbing hover:text-zinc-500`}
                    title={t('dragToReorder')}
                  >
                    <GripVertical size={14} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setCollapsedStages((prev) => {
                      const next = new Set(prev)
                      if (next.has(stage.id)) next.delete(stage.id)
                      else next.add(stage.id)
                      return next
                    })
                    if (canEdit) {
                      setSelectedStageId((id) => (id === stage.id ? null : stage.id))
                      setSelectedActionId(null)
                    }
                  }}
                  className="group flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight size={14} className="shrink-0 text-zinc-400" />
                  ) : (
                    <ChevronDown size={14} className="shrink-0 text-zinc-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      {stage.title}
                    </span>
                    <p className="mt-0.5 text-[10px] text-zinc-400">
                      {stage.actions.length === 0
                        ? t('stageEmpty')
                        : tf('stageActionCount', { count: stage.actions.length })}
                      {status === 'running' ? ` · ${t('running')}` : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <Pencil
                      size={11}
                      className={`shrink-0 ${isStageSelected ? 'text-[#0071e3]' : 'text-zinc-300'}`}
                    />
                  )}
                </button>

                {canEdit && isStageChecked && (
                  <button
                    type="button"
                    onClick={() => deleteStage(stage.id)}
                    title={t('deleteStage')}
                    className="flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-red-500 transition hover:bg-red-100"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>

              {isStageSelected && canEdit && (
                <div className="border-t border-zinc-200/80 px-3 py-2 dark:border-zinc-700/80">
                  <label className="block">
                    <span className="text-[10px] font-medium text-zinc-500">{t('stageTitle')}</span>
                    <input
                      type="text"
                      value={stage.title}
                      onChange={(e) => updateStageTitle(stage.id, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>
                </div>
              )}

              {!isCollapsed && (
                <div className="space-y-1.5 px-2 pb-2">
                  {stage.actions.length === 0 && (
                    <p className="px-2 py-1.5 text-[10px] italic text-zinc-400">{t('stageEmptyHint')}</p>
                  )}
                  <ol className="space-y-1.5">
                    {stage.actions.map((action, actionIndex) => {
                      const Icon = ACTION_ICONS[action.action] ?? Globe
                      const isRunning = action.status === 'running'
                      const isDone = action.status === 'done'
                      const isFailed = action.status === 'failed'
                      const isChecked = checkedActionIds.has(action.id)
                      const isSelected = canEdit && selectedActionId === action.id
                      const isDropTarget =
                        dropActionTarget?.stageIndex === stageIndex &&
                        dropActionTarget?.actionIndex === actionIndex &&
                        dragPayload?.kind === 'action'

                      return (
                        <li
                          key={action.id}
                          ref={isRunning ? runningActionRef : undefined}
                          className="ml-3"
                          onDragOver={(e) => {
                            if (!canEdit || dragPayload?.kind !== 'action') return
                            e.preventDefault()
                            e.stopPropagation()
                            setDropActionTarget({ stageIndex, actionIndex })
                            setDropStageIndex(null)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDropOnAction(stageIndex, actionIndex)
                          }}
                        >
                          <div
                            className={`flex min-h-9 items-center rounded-lg border transition ${
                              canEdit ? 'pl-2 pr-1' : 'px-2'
                            } ${actionCardClass({
                              isDropTarget: !!isDropTarget,
                              isChecked,
                              isSelected,
                              isRunning,
                              isFailed,
                            })}`}
                          >
                            {canEdit && (
                              <label
                                className={`${CHECKBOX_SLOT} cursor-pointer`}
                                title={t('selectAction')}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleCheckedAction(action.id)}
                                  className={checkboxClass}
                                />
                              </label>
                            )}

                            {canEdit && (
                              <div
                                draggable
                                onDragStart={(e) => {
                                  setDragPayload({ kind: 'action', stageIndex, actionIndex })
                                  e.dataTransfer.effectAllowed = 'move'
                                  e.stopPropagation()
                                }}
                                onDragEnd={() => {
                                  setDragPayload(null)
                                  clearDrop()
                                }}
                                className={`${GRIP_SLOT} cursor-grab touch-none text-zinc-300 active:cursor-grabbing hover:text-zinc-500`}
                                title={t('dragToReorder')}
                              >
                                <GripVertical size={14} />
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (canEdit) {
                                  setSelectedActionId((id) => (id === action.id ? null : action.id))
                                  setSelectedStageId(null)
                                }
                                onActionClick?.(action)
                              }}
                              className="group flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left"
                            >
                              {renderActionBadge(Icon, isRunning, isDone, isFailed)}
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                                  {action.label}
                                </span>
                                {(isRunning || (action.duration && isDone && !canEdit)) && (
                                  <p className="mt-0.5 truncate text-[10px] text-zinc-400">
                                    {isRunning ? t('running') : action.duration}
                                  </p>
                                )}
                              </div>
                              {canEdit && isChecked && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteAction(action.id)
                                  }}
                                  title={t('deleteAction')}
                                  className="flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-red-500 transition hover:bg-red-100"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                              {canEdit && (
                                <Pencil
                                  size={11}
                                  className={`shrink-0 ${isSelected ? 'text-[#0071e3]' : 'text-zinc-300'}`}
                                />
                              )}
                            </button>
                          </div>

                          {isSelected && (
                            <div className="mt-1.5 space-y-2 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/40">
                              <label className="block">
                                <span className="text-[10px] font-medium text-zinc-500">
                                  {t('stepLabel')}
                                </span>
                                <input
                                  type="text"
                                  value={action.label}
                                  onChange={(e) => updateAction(action.id, { label: e.target.value })}
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[10px] font-medium text-zinc-500">
                                  {t('stepAction')}
                                </span>
                                <select
                                  value={action.action}
                                  onChange={(e) => {
                                    const nextAction = e.target.value
                                    updateAction(action.id, {
                                      action: nextAction,
                                      duration: defaultStepDurationForAction(nextAction),
                                      target:
                                        action.target ??
                                        defaultTargetForAction(nextAction, action.label),
                                      timeout: action.timeout ?? defaultTimeoutForAction(nextAction),
                                    })
                                  }}
                                  className="mt-1 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071e3] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                                >
                                  {ACTION_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {t(
                                        opt === 'Navigate'
                                          ? 'actionNavigate'
                                          : opt === 'Click'
                                            ? 'actionClick'
                                            : opt === 'Type'
                                              ? 'actionType'
                                              : 'actionVerify',
                                      )}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTech((id) => (id === action.id ? null : action.id))
                                }
                                className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-[#0071e3]"
                              >
                                {expandedTech === action.id ? (
                                  <ChevronDown size={12} />
                                ) : (
                                  <ChevronRight size={12} />
                                )}
                                {t('technicalDetails')}
                              </button>
                              {expandedTech === action.id && (
                                <div className="space-y-2 rounded-lg border border-zinc-200/80 bg-white p-2.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                                  <label className="block">
                                    <span className="font-medium text-zinc-500">{t('stepTarget')}</span>
                                    <input
                                      type="text"
                                      value={
                                        action.target ??
                                        defaultTargetForAction(action.action, action.label)
                                      }
                                      onChange={(e) =>
                                        updateAction(action.id, { target: e.target.value })
                                      }
                                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] outline-none focus:border-[#0071e3] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="font-medium text-zinc-500">{t('stepTimeout')}</span>
                                    <input
                                      type="text"
                                      value={action.timeout ?? defaultTimeoutForAction(action.action)}
                                      onChange={(e) =>
                                        updateAction(action.id, { timeout: e.target.value })
                                      }
                                      className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] outline-none focus:border-[#0071e3] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => addActionToStage(stageIndex)}
                      className="ml-3 flex w-[calc(100%-0.75rem)] cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-1.5 text-[11px] font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-white dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                    >
                      <Plus size={12} />
                      {t('addAction')}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {canEdit && (
        <button
          type="button"
          onClick={addStage}
          className="mt-3 w-full cursor-pointer rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50"
        >
          {t('addStage')}
        </button>
      )}
    </div>
  )
}

