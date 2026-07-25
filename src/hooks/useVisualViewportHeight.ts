import { useEffect } from 'react'

/**
 * Keep --app-height / --app-offset-top in sync with the visual viewport so
 * iOS Safari keyboard open/close does not leave the shell oversized or shifted.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport

    const sync = () => {
      if (!vv) {
        root.style.setProperty('--app-height', `${window.innerHeight}px`)
        root.style.setProperty('--app-offset-top', '0px')
        return
      }
      root.style.setProperty('--app-height', `${Math.round(vv.height)}px`)
      root.style.setProperty('--app-offset-top', `${Math.round(vv.offsetTop)}px`)
    }

    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [])
}
