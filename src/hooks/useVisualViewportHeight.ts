import { useEffect } from 'react'

/**
 * Keep a stable --app-height (layout viewport) and expose --keyboard-inset
 * so only the chat footer lifts above the keyboard. Resizing the whole
 * shell (including TopHeader) was painting a second banner on iOS.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let frame = 0

    const apply = () => {
      frame = 0
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0)
      }

      const layoutHeight = window.innerHeight
      root.style.setProperty('--app-height', `${layoutHeight}px`)
      root.style.setProperty('--app-offset-top', '0px')

      if (!vv) {
        root.style.setProperty('--keyboard-inset', '0px')
        return
      }

      // How much of the layout viewport is covered by the keyboard (and browser UI).
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
