import { useEffect } from 'react'

/**
 * Expose --app-height / --keyboard-inset for layout + keyboard lift.
 * Do not force scrollTo(0) — that fights native browser pull-to-refresh.
 *
 * Viewport uses interactive-widget=overlays-content so the layout viewport
 * does NOT shrink with the keyboard; --keyboard-inset is the single lift for
 * sticky composers. (resizes-content + inset was double-lifting on mobile.)
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
        root.style.setProperty(
          '--dock-pad-bottom',
          'max(1rem, env(safe-area-inset-bottom, 0px))',
        )
        root.classList.remove('keyboard-open')
        return
      }

      // Overlap between layout viewport bottom and visual viewport bottom.
      const raw = Math.max(0, Math.round(layoutHeight - vv.height - vv.offsetTop))
      // Ignore small chrome jitter (URL bar); real keyboards are much taller.
      const inset = raw < 120 ? 0 : raw
      root.style.setProperty('--keyboard-inset', `${inset}px`)
      root.style.setProperty(
        '--dock-pad-bottom',
        inset > 0 ? '0.75rem' : 'max(1rem, env(safe-area-inset-bottom, 0px))',
      )
      root.classList.toggle('keyboard-open', inset > 0)
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
      root.classList.remove('keyboard-open')
    }
  }, [])
}
