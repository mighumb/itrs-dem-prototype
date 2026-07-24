import { useEffect, useState } from 'react'

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

  useEffect(() => {
    if (words.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % words.length)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [words, intervalMs])

  const longest = words.reduce(
    (best, word) => (word.length > best.length ? word : best),
    words[0] ?? '',
  )
  const current = words[index] ?? longest

  return (
    <span
      className={`relative inline-grid justify-items-start overflow-hidden align-baseline text-left ${className}`}
      style={{ height: '1.15em' }}
    >
      {/* Reserve width for the longest term so the line doesn’t jump.
          text-left is required: the headline is text-center, which would
          otherwise center short words inside that wide slot (huge gap). */}
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap font-semibold">
        {longest}
      </span>
      <span
        key={`${index}-${current}`}
        className="home-word-swap col-start-1 row-start-1 whitespace-nowrap font-semibold text-[#0071e3]"
        aria-live="polite"
      >
        {current}
      </span>
    </span>
  )
}
