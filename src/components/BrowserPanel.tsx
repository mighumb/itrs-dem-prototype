import { Hand } from 'lucide-react'
import type { BrowserFrame } from '../types'

interface BrowserPanelProps {
  frame: BrowserFrame | null
  isRunning?: boolean
  embedded?: boolean
}

export default function BrowserPanel({ frame, isRunning, embedded }: BrowserPanelProps) {
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
      </div>

      {/* Viewport */}
      <div className="relative flex-1 overflow-hidden bg-gradient-to-b from-zinc-100 to-zinc-200/60 dark:from-zinc-800 dark:to-zinc-900/60">
        {!frame ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium text-zinc-500">Browser preview</p>
            <p className="max-w-xs text-xs text-zinc-400">
              Paste a URL or describe a journey to get started
            </p>
          </div>
        ) : (
          <>
            {/* Simulated page */}
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

              {/* Cursor */}
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
