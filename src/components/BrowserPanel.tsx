import { Hand } from 'lucide-react'
import type { BrowserFrame } from '../types'

interface BrowserPanelProps {
  frame: BrowserFrame | null
  isRunning?: boolean
  embedded?: boolean
}

export default function BrowserPanel({ frame, isRunning, embedded }: BrowserPanelProps) {
  const hasScreenshot = Boolean(frame?.screenshotDataUrl)

  return (
    <div
      className={`flex h-full flex-col overflow-hidden ${
        embedded ? '' : 'rounded-2xl border border-zinc-200/80 bg-white dark:border-zinc-700/80 dark:bg-zinc-900'
      }`}
    >
      {/* Chrome */}
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/50">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          {frame?.url ?? 'about:blank'}
        </div>
        {isRunning && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        )}
        {frame?.title && hasScreenshot && (
          <span className="hidden max-w-[9rem] truncate text-[10px] text-zinc-400 md:inline">
            {frame.title}
          </span>
        )}
      </div>

      {/* Viewport */}
      <div className="relative flex-1 overflow-hidden bg-zinc-200/70 dark:bg-zinc-900/80">
        {!frame ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-zinc-500">Browser preview</p>
            <p className="max-w-xs text-xs text-zinc-400">
              Run a journey to watch real Playwright screenshots step by step
            </p>
          </div>
        ) : hasScreenshot ? (
          <img
            src={frame.screenshotDataUrl}
            alt={frame.title || frame.url || 'Browser screenshot'}
            className="h-full w-full object-contain object-top bg-white"
          />
        ) : (
          <>
            {/* Fallback wireframe when no live screenshot */}
            <div className="absolute inset-4 overflow-hidden rounded-lg bg-white">
              <div className="flex h-10 items-center border-b border-zinc-100 px-4">
                <div className="h-4 w-16 rounded bg-zinc-900" />
                <div className="ml-auto flex gap-3">
                  <div className="h-3 w-12 rounded bg-zinc-100" />
                  <div className="h-3 w-12 rounded bg-zinc-100" />
                  <div className="h-3 w-12 rounded bg-zinc-100" />
                </div>
              </div>
              <div className="p-4">
                <div className="mb-3 h-5 w-2/3 rounded bg-zinc-800" />
                <div className="mb-2 h-3 w-full rounded bg-zinc-100" />
                <div className="mb-2 h-3 w-5/6 rounded bg-zinc-100" />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="aspect-square rounded-lg bg-zinc-100" />
                  <div className="aspect-square rounded-lg bg-zinc-100" />
                  <div className="aspect-square rounded-lg bg-zinc-100" />
                </div>
              </div>

              {frame.cursor && (
                <div
                  className="pointer-events-none absolute h-4 w-4 transition-all duration-500"
                  style={{
                    left: `${frame.cursor.x}%`,
                    top: `${frame.cursor.y}%`,
                  }}
                >
                  <MousePointerIcon />
                </div>
              )}
            </div>
            {frame.highlight && (
              <p className="absolute bottom-3 left-3 right-3 truncate rounded-md bg-black/55 px-2 py-1 text-[11px] text-white">
                {frame.highlight}
              </p>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {frame && (
        <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Hand size={12} />
            Take control
          </button>
          {hasScreenshot && (
            <span className="text-[10px] text-zinc-400">Playwright capture</span>
          )}
        </div>
      )}
    </div>
  )
}

function MousePointerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 3l14 9-6.5 1.5L11 20 5 3z"
        fill="#1d1d1f"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
