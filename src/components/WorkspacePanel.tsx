import { GripVertical, SquareArrowOutUpRight, X } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'

interface WorkspacePanelProps {
  id: string
  title: string
  flexClass?: string
  actions?: ReactNode
  hiddenBelowMd?: boolean
  onClose?: () => void
  onDetach?: () => void
  isDragging?: boolean
  isDropTarget?: boolean
  onDragStart: (event: DragEvent, id: string) => void
  onDragOver: (event: DragEvent, id: string) => void
  onDrop: (event: DragEvent, id: string) => void
  onDragEnd: () => void
  children: ReactNode
}

export default function WorkspacePanel({
  id,
  title,
  flexClass = 'flex-1 min-w-0',
  actions,
  hiddenBelowMd,
  onClose,
  onDetach,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  children,
}: WorkspacePanelProps) {
  return (
    <section
      onDragOver={(event) => onDragOver(event, id)}
      onDrop={(event) => onDrop(event, id)}
      className={`${flexClass} ${hiddenBelowMd ? 'hidden md:flex' : 'flex'} min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white dark:border-zinc-700/80 dark:bg-zinc-900 ${
        isDragging ? 'opacity-45' : ''
      } ${isDropTarget ? 'ring-2 ring-[#0071e3]/35 ring-offset-2 ring-offset-[#f5f5f7] dark:ring-offset-zinc-950' : ''}`}
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-zinc-100 px-2 py-2 dark:border-zinc-800">
        <div
          draggable
          onDragStart={(event) => onDragStart(event, id)}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          className="flex cursor-grab items-center rounded p-1 text-zinc-300 transition hover:bg-zinc-50 hover:text-zinc-500 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
        >
          <GripVertical size={14} />
        </div>
        <p className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-zinc-400">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          {onDetach && (
            <button
              type="button"
              onClick={onDetach}
              title="Open in detached window"
              className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <SquareArrowOutUpRight size={14} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close panel"
              className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  )
}
