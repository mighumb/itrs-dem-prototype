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
  const sizerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (words.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % words.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [words, intervalMs])

  const current = words[index] ?? words[0] ?? ''

  useLayoutEffect(() => {
    const el = sizerRef.current
    if (!el) return
    setWidth(el.offsetWidth)
  }, [current])

  return (
    <span
      className={`relative inline-grid overflow-hidden align-baseline ${className}`}
      style={{
        width: width ?? undefined,
        transition: width == null ? undefined : 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* In-flow sizer: same metrics as “Which” — no taller 1.15em / flex-center box */}
      <span
        ref={sizerRef}
        className="invisible col-start-1 row-start-1 whitespace-nowrap"
        aria-hidden
      >
        {current}
      </span>
      <span
        key={`${index}-${current}`}
        className="home-word-swap col-start-1 row-start-1 whitespace-nowrap text-[#0071e3]"
        aria-live="polite"
      >
        {current}
      </span>
    </span>
  )
}
