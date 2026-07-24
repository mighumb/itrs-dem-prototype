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

  const current = words[index] ?? words[0] ?? ''

  return (
    // w-max + text-left: slot is always the *current* word width.
    // (JS width on a stretched grid cell got stuck on “application” and
    // h1 text-center then left a huge gap before short blue terms.)
    <span
      className={`relative inline-grid w-max max-w-full justify-items-start overflow-hidden align-baseline text-left ${className}`}
    >
      <span className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden>
        {current}
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
