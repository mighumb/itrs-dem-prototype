import {
  ChevronDown,
  ChevronRight,
  Globe,
  GripVertical,
  Loader2,
  MousePointerClick,
  Pencil,
  ShieldCheck,
  Trash2,
  Type,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { defaultStepDurationForAction } from '../mock/data'
import type { JourneyStep } from '../types'

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

function defaultTargetForStep(action: string, label: string): string {
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
  steps: JourneyStep[]
  compact?: boolean
  editMode?: boolean
  onStepsChange?: (steps: JourneyStep[]) => void
  onStepClick?: (step: JourneyStep) => void
}

export default function JourneyTimeline({
  steps,
  editMode = false,
  onStepsChange,
  onStepClick,
}: JourneyTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [expandedTech, setExpandedTech] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const runningStepRef = useRef<HTMLLIElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const canEdit = editMode && !!onStepsChange

  useEffect(() => {
    if (!editMode) {
      setCheckedIds(new Set())
      setSelectedId(null)
      setExpandedTech(null)
    }
  }, [editMode])

  useEffect(() => {
    setCheckedIds((prev) => {
      const valid = new Set(steps.map((s) => s.id))
      const next = new Set([...prev].filter((id) => valid.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [steps])

  const allSelected = steps.length > 0 && checkedIds.size === steps.length
  const someSelected = checkedIds.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  useEffect(() => {
    if (steps.some((s) => s.status === 'running')) {
      runningStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [steps])

  if (steps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4 text-center text-sm text-zinc-400">
        Steps will appear here as the agent builds your journey.
      </div>
    )
  }

  const updateStep = (id: string, patch: Partial<JourneyStep>) => {
    if (!onStepsChange) return
    onStepsChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const reorderSteps = (from: number, to: number) => {
    if (!onStepsChange || from === to) return
    const next = [...steps]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onStepsChange(next)
  }

  const addStep = () => {
    if (!onStepsChange) return
    const newStep: JourneyStep = {
      id: `step-${Date.now()}`,
      label: 'New step',
      action: 'Click',
      status: 'pending',
      duration: defaultStepDurationForAction('Click'),
      target: defaultTargetForStep('Click', 'New step'),
      timeout: defaultTimeoutForAction('Click'),
    }
    onStepsChange([...steps, newStep])
    setSelectedId(newStep.id)
  }

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(steps.map((s) => s.id)))
    }
  }

  const deleteSelected = () => {
    if (!onStepsChange || checkedIds.size === 0) return
    const toDelete = checkedIds
    onStepsChange(steps.filter((s) => !toDelete.has(s.id)))
    setCheckedIds(new Set())
    setSelectedId((current) => (current && toDelete.has(current) ? null : current))
    setExpandedTech((current) => (current && toDelete.has(current) ? null : current))
  }

  const deleteStep = (id: string) => {
    if (!onStepsChange) return
    onStepsChange(steps.filter((s) => s.id !== id))
    setCheckedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setSelectedId((current) => (current === id ? null : current))
    setExpandedTech((current) => (current === id ? null : current))
  }

  const handleStepClick = (step: JourneyStep) => {
    if (canEdit) {
      setSelectedId((id) => (id === step.id ? null : step.id))
    }
    onStepClick?.(step)
  }

  const checkboxClass =
    'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-300 text-[#0071e3] focus:ring-[#0071e3]/30'

  const deleteLabel =
    checkedIds.size === 0
      ? 'Delete'
      : checkedIds.size === steps.length
        ? 'Delete all'
        : `Delete (${checkedIds.size})`

  const stepCardClass = (state: {
    isDropTarget: boolean
    isChecked: boolean
    isSelected: boolean
    isRunning: boolean
    isFailed: boolean
  }) => {
    if (state.isDropTarget) return 'border-[#0071e3] border-dashed bg-[#0071e3]/5'
    if (state.isChecked) return 'border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/30'
    if (state.isSelected) return 'border-[#0071e3]/40 bg-[#0071e3]/5'
    if (state.isRunning) return 'border-[#0071e3]/30 bg-[#0071e3]/5'
    if (state.isFailed) return 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/30'
    return 'border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-700/80 dark:bg-zinc-900 dark:hover:border-zinc-600'
  }

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
      {isRunning ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Icon size={12} />
      )}
    </div>
  )

  return (
    <div className="overflow-y-auto px-3 py-3">
      {canEdit && (
        <div className="mb-2 flex min-h-9 items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 py-2 pl-2.5 pr-3 dark:border-zinc-700/80 dark:bg-zinc-800/50">
          <label className={`${CHECKBOX_SLOT} cursor-pointer`} title="Select all steps">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className={checkboxClass}
            />
          </label>
          <span className="min-w-0 flex-1 text-left text-[11px] font-medium leading-none text-zinc-600 dark:text-zinc-400">
            Select all
          </span>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={checkedIds.size === 0}
            title={deleteLabel}
            className="flex shrink-0 cursor-pointer items-center rounded-md px-1 text-[11px] font-medium leading-none text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleteLabel}
          </button>
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((step, index) => {
          const Icon = ACTION_ICONS[step.action] ?? Globe
          const isRunning = step.status === 'running'
          const isDone = step.status === 'done'
          const isFailed = step.status === 'failed'
          const isChecked = checkedIds.has(step.id)
          const isSelected = canEdit && selectedId === step.id
          const isDragging = dragIndex === index
          const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index

          return (
            <li
              key={step.id}
              ref={isRunning ? runningStepRef : undefined}
              className={`animate-fade-in ${isDragging ? 'opacity-40' : ''}`}
              onDragOver={(e) => {
                if (!canEdit || dragIndex === null) return
                e.preventDefault()
                setDropIndex(index)
              }}
              onDragLeave={() => {
                if (dropIndex === index) setDropIndex(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndex === null) return
                reorderSteps(dragIndex, index)
                setDragIndex(null)
                setDropIndex(null)
              }}
            >
              <div
                className={`flex min-h-9 items-center rounded-xl border transition ${
                  canEdit ? 'pl-2.5 pr-1' : 'px-2'
                } ${stepCardClass({ isDropTarget, isChecked, isSelected, isRunning, isFailed })}`}
              >
                {canEdit && (
                  <label
                    className={`${CHECKBOX_SLOT} cursor-pointer`}
                    title="Select step"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleChecked(step.id)}
                      className={checkboxClass}
                    />
                  </label>
                )}

                {canEdit && (
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(index)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setDragIndex(null)
                      setDropIndex(null)
                    }}
                    className={`${GRIP_SLOT} cursor-grab touch-none text-zinc-300 active:cursor-grabbing hover:text-zinc-500`}
                    title="Drag to reorder"
                  >
                    <GripVertical size={14} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleStepClick(step)}
                  className="group flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
                >
                  {renderActionBadge(Icon, isRunning, isDone, isFailed)}

                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {step.label}
                    </span>
                    {step.duration && isDone && !canEdit && (
                      <p className="mt-0.5 text-[10px] text-zinc-400">{step.duration}</p>
                    )}
                    {isRunning && (
                      <p className="mt-0.5 text-[10px] text-[#0071e3] animate-pulse-soft">
                        Running…
                      </p>
                    )}
                  </div>

                  {canEdit && isChecked && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteStep(step.id)
                      }}
                      title="Delete step"
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
                    <span className="text-[10px] font-medium text-zinc-500">Label</span>
                    <input
                      type="text"
                      value={step.label}
                      onChange={(e) => updateStep(step.id, { label: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3]/20 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-medium text-zinc-500">Action</span>
                    <select
                      value={step.action}
                      onChange={(e) => {
                        const action = e.target.value
                        updateStep(step.id, {
                          action,
                          duration: defaultStepDurationForAction(action),
                          target: step.target ?? defaultTargetForStep(action, step.label),
                          timeout: step.timeout ?? defaultTimeoutForAction(action),
                        })
                      }}
                      className="mt-1 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071e3] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      {ACTION_OPTIONS.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTech((id) => (id === step.id ? null : step.id))
                    }
                    className="flex cursor-pointer items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-[#0071e3]"
                  >
                    {expandedTech === step.id ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                    Technical details
                  </button>
                  {expandedTech === step.id && (
                    <div className="space-y-2 rounded-lg border border-zinc-200/80 bg-white p-2.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      <label className="block">
                        <span className="font-medium text-zinc-500">Target</span>
                        <input
                          type="text"
                          value={step.target ?? defaultTargetForStep(step.action, step.label)}
                          onChange={(e) => updateStep(step.id, { target: e.target.value })}
                          className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] outline-none focus:border-[#0071e3] dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                      </label>
                      <label className="block">
                        <span className="font-medium text-zinc-500">Timeout</span>
                        <input
                          type="text"
                          value={step.timeout ?? defaultTimeoutForAction(step.action)}
                          onChange={(e) => updateStep(step.id, { timeout: e.target.value })}
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
          onClick={addStep}
          className="mt-3 w-full cursor-pointer rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50"
        >
          + Add step
        </button>
      )}
    </div>
  )
}
