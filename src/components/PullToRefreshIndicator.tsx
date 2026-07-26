import { RefreshCw } from 'lucide-react'

interface PullToRefreshIndicatorProps {
  pullPx: number
  progress: number
  refreshing: boolean
  active: boolean
}

/** Minimal top spinner for the app-wide pull-to-refresh gesture. */
export default function PullToRefreshIndicator({
  pullPx,
  progress,
  refreshing,
  active,
}: PullToRefreshIndicatorProps) {
  if (!active) return null

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[70] flex justify-center md:hidden"
      style={{
        transform: `translateY(${Math.max(8, pullPx - 8)}px)`,
        opacity: refreshing ? 1 : Math.min(1, progress * 1.15),
        transition: refreshing ? 'none' : 'opacity 0.12s ease-out',
      }}
      aria-hidden
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#0071e3] shadow-[0_4px_16px_rgb(0,0,0,0.1)] dark:bg-zinc-900/95 dark:text-[#4da3ff] dark:shadow-black/40">
        <RefreshCw
          size={18}
          className={refreshing ? 'animate-spin' : undefined}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${progress * 280}deg)` }
          }
        />
      </div>
    </div>
  )
}
