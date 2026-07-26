import { useEffect } from 'react'

/**
 * Expose --app-height / --keyboard-inset for layout + keyboard lift.
 * Do not force scrollTo(0) — that fights native browser pull-to-refresh.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      const layoutHeight = window.innerHeight
      root.style.setProperty('--app-height', `${layoutHeight}px`)
      root.style.setProperty('--app-offset-top', '0px')

      if (!vv) {
        root.style.setProperty('--keyboard-inset', '0px')
        return
      }

      const inset = Math.max(0, Math.round(layoutHeight - vv.height - vv.offsetTop))
      root.style.setProperty('--keyboard-inset', `${inset}px`)
    }

    const sync = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }

    apply()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])
}
