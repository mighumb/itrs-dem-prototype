import { useEffect } from 'react'

/**
 * Keep --app-height in sync with the visual viewport so the keyboard
 * shortens the shell from the bottom. Avoid fighting iOS with offsetTop
 * snaps (those caused the input jump-to-top / drop-back).
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      // Pin document scroll — iOS otherwise pans the focused field to the top.
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0)
      }
      const height = vv ? Math.round(vv.height) : window.innerHeight
      root.style.setProperty('--app-height', `${height}px`)
      // Keep top pinned; height alone lifts the footer above the keyboard.
      root.style.setProperty('--app-offset-top', '0px')
    }

    const sync = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    apply()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])
}
