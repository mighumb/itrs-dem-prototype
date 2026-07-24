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

  // Fit the slot to the *current* word so the whole headline stays optically centered
  // (no fake wide box that left-aligns short terms).
  useLayoutEffect(() => {
    const el = sizerRef.current
    if (!el) return
    setWidth(el.offsetWidth)
  }, [current])

  return (
    <span
      className={`relative inline-block overflow-hidden align-baseline ${className}`}
      style={{
        height: '1.15em',
        width: width ?? undefined,
        transition: width == null ? undefined : 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <span
        ref={sizerRef}
        className="invisible absolute left-0 top-0 whitespace-nowrap font-semibold"
        aria-hidden
      >
        {current}
      </span>
      <span
        key={`${index}-${current}`}
        className="home-word-swap absolute inset-0 flex items-center justify-center whitespace-nowrap font-semibold text-[#0071e3]"
        aria-live="polite"
      >
        {current}
      </span>
    </span>
  )
}
