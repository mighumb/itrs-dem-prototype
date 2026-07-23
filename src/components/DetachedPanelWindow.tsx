import { Maximize2, Minimize2, PanelRightClose } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type DetachablePanelId = 'browser' | 'monitoring'

const PANEL_TITLES: Record<DetachablePanelId, string> = {
  browser: 'Browser',
  monitoring: 'Monitoring',
}

interface DetachedPanelWindowProps {
  id: DetachablePanelId
  title: string
  layout: 'solo' | 'split'
  onDock: () => void
  children: ReactNode
}

function DetachedPanelWindow({
  id,
  title,
  layout,
  onDock,
  children,
}: DetachedPanelWindowProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const syncFullscreen = useCallback(() => {
    setIsFullscreen(document.fullscreenElement === shellRef.current)
  }, [])

  useEffect(() => {
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [syncFullscreen])

  const toggleFullscreen = async () => {
    const node = shellRef.current
    if (!node) return
    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen()
      } else {
        await node.requestFullscreen()
      }
    } catch {
      // Fullscreen may be blocked in some contexts.
    }
  }

  return (
    <div
      data-detached-panel={id}
      className={`flex min-h-0 min-w-0 flex-col bg-[var(--color-surface)] ${
        layout === 'solo' ? 'flex-1' : 'w-1/2 shrink-0'
      } ${layout === 'split' ? 'border-l border-zinc-200/80 first:border-l-0 dark:border-zinc-800' : ''}`}
    >
      <div
        ref={shellRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-900"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200/80 bg-zinc-50/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {title}
            </span>
            <span className="hidden rounded-full bg-[#0071e3]/10 px-2 py-0.5 text-[10px] font-medium text-[#0071e3] sm:inline">
              Detached
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              onClick={onDock}
              title="Dock back to workspace"
              className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <PanelRightClose size={15} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  )
}

interface DetachedPanelsLayerProps {
  detachedIds: DetachablePanelId[]
  renderPanel: (id: DetachablePanelId) => ReactNode
  onDock: (id: DetachablePanelId) => void
}

export function DetachedPanelsLayer({
  detachedIds,
  renderPanel,
  onDock,
}: DetachedPanelsLayerProps) {
  const root = document.getElementById('detached-panels-root')
  if (detachedIds.length === 0 || !root) return null

  const layout = detachedIds.length === 1 ? 'solo' : 'split'

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-surface)]">
      <div className="flex min-h-0 flex-1">
        {detachedIds.map((id) => (
          <DetachedPanelWindow
            key={id}
            id={id}
            title={PANEL_TITLES[id]}
            layout={layout}
            onDock={() => onDock(id)}
          >
            {renderPanel(id)}
          </DetachedPanelWindow>
        ))}
      </div>
    </div>,
    root,
  )
}
