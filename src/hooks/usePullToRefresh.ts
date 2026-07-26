import { useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD_PX = 72
const MAX_PULL_PX = 120

function isScrollableY(el: Element): boolean {
  const style = window.getComputedStyle(el)
  const oy = style.overflowY
  if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') return false
  return (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1
}

/** True when every scrollable ancestor of the touch target is at the top. */
function canPullToRefresh(target: EventTarget | null): boolean {
  if (window.scrollY > 0) return false
  const el = target instanceof Element ? target : null
  // Don't steal gestures from drawers / modals, or while the keyboard is up.
  if (el?.closest('#mobile-nav-drawer, [role="dialog"]')) return false
  const insetRaw = getComputedStyle(document.documentElement)
    .getPropertyValue('--keyboard-inset')
    .trim()
  const inset = Number.parseFloat(insetRaw)
  if (Number.isFinite(inset) && inset > 24) return false

  let node: Element | null = el
  while (node && node !== document.documentElement) {
    if (isScrollableY(node) && (node as HTMLElement).scrollTop > 0) {
      return false
    }
    node = node.parentElement
  }
  return true
}

/**
 * App-wide pull-to-refresh. Native browser PTR cannot run while the shell
 * locks document overflow (needed for layout stability) — this restores the
 * gesture on home, chat, and other screens without re-enabling sideways pan.
 */
export function usePullToRefresh(enabled = true) {
  const [pullPx, setPullPx] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pulling = useRef(false)
  const pullPxRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const onStart = (e: TouchEvent) => {
      if (refreshing) return
      if (e.touches.length !== 1) return
      if (!canPullToRefresh(e.target)) {
        startY.current = null
        pulling.current = false
        return
      }
      startY.current = e.touches[0].clientY
      pulling.current = false
      pullPxRef.current = 0
    }

    const onMove = (e: TouchEvent) => {
      if (refreshing || startY.current == null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        if (pulling.current) {
          pulling.current = false
          pullPxRef.current = 0
          setPullPx(0)
        }
        return
      }
      // Still at top? (user may have scrolled mid-gesture)
      if (!canPullToRefresh(e.target)) {
        pulling.current = false
        startY.current = null
        pullPxRef.current = 0
        setPullPx(0)
        return
      }
      pulling.current = true
      // Resist after threshold so it doesn't feel elastic forever.
      const resisted = Math.min(MAX_PULL_PX, dy * 0.45)
      pullPxRef.current = resisted
      setPullPx(resisted)
      if (resisted > 8) {
        e.preventDefault()
      }
    }

    const onEnd = () => {
      if (refreshing) return
      const distance = pullPxRef.current
      startY.current = null
      pulling.current = false
      pullPxRef.current = 0
      if (distance >= PULL_THRESHOLD_PX) {
        setPullPx(PULL_THRESHOLD_PX)
        setRefreshing(true)
        window.setTimeout(() => {
          window.location.reload()
        }, 180)
        return
      }
      setPullPx(0)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled, refreshing])

  const progress = Math.min(1, pullPx / PULL_THRESHOLD_PX)

  return { pullPx, progress, refreshing, active: pullPx > 0 || refreshing }
}
