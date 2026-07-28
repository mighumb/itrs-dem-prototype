import { GripVertical, Loader2, Plus } from 'lucide-react'
import type { DragEvent } from 'react'
import { useLocale } from '../context/LocaleContext'

export type CollapsedPanelStatus = 'running' | 'ok' | 'failed' | null

interface CollapsedWorkspacePanelProps {
  id: string
  title: string
  /** Status chip — only meaningful while the panel is reduced. */
  status?: CollapsedPanelStatus
  isDragging?: boolean
  isDropTarget?: boolean
  onRestore: () => void
  onDragStart: (event: DragEvent, id: string) => void
  onDragOver: (event: DragEvent, id: string) => void
  onDrop: (event: DragEvent, id: string) => void
  onDragEnd: () => void
}

export default function CollapsedWorkspacePanel({
  id,
  title,
  status = null,
  isDragging,
  isDropTarget,
  onRestore,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: CollapsedWorkspacePanelProps) {
  const { t } = useLocale()
  return (
    <div
      onDragOver={(event) => onDragOver(event, id)}
      onDrop={(event) => onDrop(event, id)}
      className={`flex w-[200px] shrink-0 self-start flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white dark:border-zinc-700/80 dark:bg-zinc-900 ${
        isDragging ? 'opacity-45' : ''
      } ${isDropTarget ? 'ring-2 ring-[#0071e3]/35 ring-offset-2 ring-offset-[#f5f5f7] dark:ring-offset-zinc-950' : ''}`}
    >
      <header className="flex items-center gap-1.5 border-b border-zinc-100 px-2 py-2 dark:border-zinc-800">
        <div
          draggable
          onDragStart={(event) => onDragStart(event, id)}
          onDragEnd={onDragEnd}
          title={t('dragToRestore')}
          className="flex cursor-grab items-center rounded p-1 text-zinc-300 transition hover:bg-zinc-50 hover:text-zinc-500 active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </div>
        <p className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-zinc-400">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {status === 'running' && (
            <span
              title={t('running')}
              aria-label={t('running')}
              className="flex h-4 w-4 items-center justify-center text-[#0071e3]"
            >
              <Loader2 size={14} className="animate-spin" />
            </span>
          )}
          {status === 'ok' && (
            <span
              title={t('journeyRunOk')}
              aria-label={t('journeyRunOk')}
              className="h-2.5 w-2.5 rounded-full bg-emerald-500"
            />
          )}
          {status === 'failed' && (
            <span
              title={t('journeyRunFailed')}
              aria-label={t('journeyRunFailed')}
              className="h-2.5 w-2.5 rounded-full bg-red-500"
            />
          )}
          <button
            type="button"
            onClick={onRestore}
            title={t('restorePanel')}
            className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <Plus size={14} />
          </button>
        </div>
      </header>
    </div>
  )
}
