import { useCallback, useState, type DragEvent } from 'react'

export type WorkspacePanelId = 'agent' | 'steps' | 'browser' | 'monitoring'

export const PANEL_LABELS: Record<WorkspacePanelId, string> = {
  agent: 'Agent',
  steps: 'Steps',
  browser: 'Browser',
  monitoring: 'Monitoring',
}

export const ALL_PANEL_IDS: WorkspacePanelId[] = ['agent', 'steps', 'browser', 'monitoring']

export const DEFAULT_OPEN_PANELS: WorkspacePanelId[] = ['agent', 'steps', 'browser']

const DEFAULT_ORDER: WorkspacePanelId[] = ['agent', 'steps', 'browser', 'monitoring']

function reorderPanels(
  order: WorkspacePanelId[],
  sourceId: WorkspacePanelId,
  targetId: WorkspacePanelId,
): WorkspacePanelId[] {
  const from = order.indexOf(sourceId)
  const to = order.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return order

  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, sourceId)
  return next
}

export function usePanelOrder(initial: WorkspacePanelId[] = DEFAULT_ORDER) {
  const [order, setOrder] = useState(initial)
  const [draggedId, setDraggedId] = useState<WorkspacePanelId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<WorkspacePanelId | null>(null)

  const handleDragStart = useCallback((event: DragEvent, id: string) => {
    const panelId = id as WorkspacePanelId
    setDraggedId(panelId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', panelId)
  }, [])

  const handleDragOver = useCallback(
    (event: DragEvent, id: string) => {
      event.preventDefault()
      const panelId = id as WorkspacePanelId
      if (draggedId && draggedId !== panelId) {
        setDropTargetId(panelId)
      }
    },
    [draggedId],
  )

  const handleDrop = useCallback(
    (event: DragEvent, targetId: string) => {
      event.preventDefault()
      const sourceId = (draggedId ?? event.dataTransfer.getData('text/plain')) as WorkspacePanelId
      const panelTarget = targetId as WorkspacePanelId
      if (sourceId && sourceId !== panelTarget) {
        setOrder((prev) => reorderPanels(prev, sourceId, panelTarget))
      }
      setDraggedId(null)
      setDropTargetId(null)
    },
    [draggedId],
  )

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDropTargetId(null)
  }, [])

  return {
    order,
    draggedId,
    dropTargetId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  }
}

/** Panels that stay in a narrow, centered column when alone (chat / timeline). */
export const NARROW_PANEL_IDS: WorkspacePanelId[] = ['agent', 'steps']

const WIDE_PANEL_IDS: WorkspacePanelId[] = ['browser', 'monitoring']

export function shouldCenterWorkspace(visibleIds: WorkspacePanelId[]): boolean {
  return visibleIds.length === 1 && NARROW_PANEL_IDS.includes(visibleIds[0])
}

function isNarrowPairOnly(visibleIds: WorkspacePanelId[]): boolean {
  return visibleIds.length === 2 && visibleIds.every((id) => NARROW_PANEL_IDS.includes(id))
}

export function getPanelFlexClass(
  id: WorkspacePanelId,
  visibleIds: WorkspacePanelId[],
  options?: { stepsEditMode?: boolean },
): string {
  const centerSolo = shouldCenterWorkspace(visibleIds)
  const narrowPair = isNarrowPairOnly(visibleIds)
  const hasWide = visibleIds.some((panelId) => WIDE_PANEL_IDS.includes(panelId))
  const alone = visibleIds.length === 1 && visibleIds[0] === id

  switch (id) {
    case 'agent':
      if (centerSolo && alone) {
        return 'w-full min-w-[480px] max-w-[720px] shrink-0'
      }
      if (narrowPair) {
        return 'min-w-[280px] flex-[1_1_400px] min-w-0 flex-1'
      }
      return 'min-w-[280px] max-w-[400px] shrink-0 flex-[0_1_400px]'

    case 'steps':
      if (centerSolo && alone) {
        return options?.stepsEditMode
          ? 'w-full min-w-[360px] max-w-[720px] shrink-0'
          : 'w-full min-w-[360px] max-w-[640px] shrink-0'
      }
      if (narrowPair) {
        return options?.stepsEditMode
          ? 'min-w-[220px] flex-[1.25_1_280px] min-w-0 flex-1'
          : 'min-w-[220px] flex-[0.85_1_360px] min-w-0 flex-1'
      }
      return options?.stepsEditMode
        ? 'min-w-[220px] max-w-[400px] shrink-0 flex-[0_1_400px]'
        : 'min-w-[220px] max-w-[360px] shrink-0 flex-[0_1_360px]'

    case 'browser':
      if (alone) {
        return 'w-full flex-1 min-w-0'
      }
      return 'min-w-[320px] flex-[2_1_320px] min-w-0 flex-1'

    case 'monitoring':
      if (alone) {
        return 'w-full flex-1 min-w-0'
      }
      return 'min-w-[360px] flex-[1.15_1_360px] min-w-0 flex-1'

    default:
      return hasWide ? 'min-w-0 flex-1' : 'w-full shrink-0'
  }
}
