import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface RotatingWordProps {
  words: readonly string[]
  intervalMs?: number
  className?: string
}

/** Vertical mask swap for a single rotating term inside a headline. */
export default function RotatingWord({
  words,
  intervalMs = 2600,
  className = '',
}: RotatingWordProps) {
  const [index, setIndex] = useState(0)
  const [width, setWidth] = useState<number | null>(null)
  const measureRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (words.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % words.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [words, intervalMs])

  const current = words[index] ?? words[0] ?? ''

  // Measure off-flow (fixed) so parent width never stretches the sizer —
  // that was what locked the slot to “application” before.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    setWidth(Math.ceil(el.getBoundingClientRect().width))
  }, [current])

  return (
    <span
      className={`home-word-slot relative inline-grid max-w-full justify-items-start overflow-hidden align-baseline text-left leading-[1.15] ${className}`}
      style={width != null ? { width } : undefined}
    >
      <span
        ref={measureRef}
        className="pointer-events-none fixed left-0 top-0 -z-50 whitespace-nowrap opacity-0"
        style={{ font: 'inherit' }}
        aria-hidden
      >
        {current}
      </span>
      {/* Height/baseline strut only — not used for width (avoids min-content fight) */}
      <span
        className="invisible col-start-1 row-start-1 inline-block w-0 overflow-hidden whitespace-nowrap"
        aria-hidden
      >
        A
      </span>
      <span
        key={`${index}-${current}`}
        className="home-word-swap col-start-1 row-start-1 whitespace-nowrap text-left text-[#0071e3]"
        aria-live="polite"
      >
        {current}
      </span>
    </span>
  )
}
