import { ChevronLeft, LogIn, Menu, Moon, Settings, Sun, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'

interface TopHeaderProps {
  onLogIn: () => void
  onSignUp: () => void
  onBookDemo: () => void
  onHome?: () => void
  journeyTitle?: string
  journeySubtitle?: string
}

type DrawerView = 'main' | 'settings'

/** One notch wider than the previous 16rem / 72vw cap. */
const DRAWER_WIDTH = 'min(18.5rem, 80vw)'
const DRAWER_MOTION_MS = 280

function BrandMark({
  theme,
  size = 22,
  className = '',
}: {
  theme: 'light' | 'dark'
  size?: number
  className?: string
}) {
  // Light UI → dark glyph; dark UI → light glyph (assets named for the mode they serve).
  const src =
    theme === 'dark' ? '/itrs-favicon-dark-mode.svg' : '/itrs-favicon-light-mode.svg'
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}

export default function TopHeader({
  onLogIn,
  onSignUp: _onSignUp,
  onBookDemo,
  onHome,
  journeyTitle,
  journeySubtitle,
}: TopHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMounted, setDrawerMounted] = useState(false)
  const [drawerEntered, setDrawerEntered] = useState(false)
  const [drawerView, setDrawerView] = useState<DrawerView>('main')
  const drawerTitleId = useId()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { t, locale, setLocale } = useLocale()

  const openDrawer = () => {
    setDrawerView('main')
    setDrawerMounted(true)
    setDrawerOpen(true)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setDrawerEntered(false)
    setDrawerView('main')
  }

  const toggleDrawer = () => {
    if (drawerOpen) closeDrawer()
    else openDrawer()
  }

  // Enter: double-rAF so the closed transform paints before sliding in.
  useEffect(() => {
    if (!drawerOpen || !drawerMounted) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawerEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [drawerOpen, drawerMounted])

  // Exit: keep mounted until the slide-out finishes.
  useEffect(() => {
    if (drawerOpen || !drawerMounted) return
    const timer = window.setTimeout(() => setDrawerMounted(false), DRAWER_MOTION_MS)
    return () => window.clearTimeout(timer)
  }, [drawerOpen, drawerMounted])

  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (drawerView === 'settings') {
        setDrawerView('main')
        return
      }
      closeDrawer()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen, drawerView])

  useEffect(() => {
    if (!drawerEntered) return
    closeBtnRef.current?.focus()
  }, [drawerEntered])

  // Return focus to the burger after the panel unmounts from a close.
  const wasDrawerMountedRef = useRef(false)
  useEffect(() => {
    if (wasDrawerMountedRef.current && !drawerMounted) {
      menuBtnRef.current?.focus()
    }
    wasDrawerMountedRef.current = drawerMounted
  }, [drawerMounted])

  const goHome = () => {
    closeDrawer()
    onHome?.()
  }

  const openSignIn = () => {
    closeDrawer()
    onLogIn()
  }

  const languageToggle = (opts?: { fullWidth?: boolean; large?: boolean }) => {
    const fullWidth = opts?.fullWidth
    const large = opts?.large
    const btn = `${fullWidth ? 'flex-1' : ''} cursor-pointer rounded-md font-semibold tracking-wide transition ${
      large ? 'min-h-11 px-3 py-2.5 text-[16px]' : 'px-2 py-1 text-xs'
    }`
    return (
      <div
        className={`flex items-center border border-zinc-200 dark:border-zinc-700 ${
          fullWidth ? 'w-full rounded-xl p-1' : 'rounded-lg p-0.5'
        }`}
        role="group"
        aria-label={t('language')}
      >
        <button
          type="button"
          onClick={() => setLocale('en')}
          aria-pressed={locale === 'en'}
          className={`${btn} ${
            locale === 'en'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLocale('fr')}
          aria-pressed={locale === 'fr'}
          className={`${btn} ${
            locale === 'fr'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
          }`}
        >
          FR
        </button>
      </div>
    )
  }

  const themeButton = (opts?: {
    className?: string
    withLabel?: boolean
    iconSize?: number
    labelClassName?: string
  }) => (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? t('lightMode') : t('darkMode')}
      aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
      className={
        opts?.className ??
        'flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
      }
    >
      {theme === 'dark' ? (
        <Sun size={opts?.iconSize ?? 16} />
      ) : (
        <Moon size={opts?.iconSize ?? 16} />
      )}
      {opts?.withLabel ? (
        <span className={opts.labelClassName ?? 'text-sm font-medium'}>
          {theme === 'dark' ? t('lightMode') : t('darkMode')}
        </span>
      ) : null}
    </button>
  )

  return (
    <>
      <header className="relative z-40 flex shrink-0 items-center gap-3 bg-[var(--color-surface)] px-4 py-3">
        {/* —— Mobile left: burger (drawer overlays header; close lives in the panel) —— */}
        <button
          ref={menuBtnRef}
          type="button"
          className="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-zinc-700 transition hover:bg-zinc-200/80 md:hidden dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label={t('menu')}
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav-drawer"
          onClick={toggleDrawer}
        >
          <Menu size={20} />
        </button>

        {/* —— Desktop left: brand → Home —— */}
        <button
          type="button"
          onClick={goHome}
          title={t('home')}
          className="hidden cursor-pointer items-center gap-2 md:flex"
        >
          <BrandMark theme={theme} />
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            ITRS DEM
          </span>
        </button>

        {/* —— Center —— */}
        <div className="min-w-0 flex-1">
          {/* Mobile center */}
          <div className="flex flex-col items-center justify-center md:hidden">
            {journeyTitle ? (
              <>
                <p className="max-w-[14rem] truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {journeyTitle}
                </p>
                {journeySubtitle ? (
                  <p className="max-w-[14rem] truncate text-xs text-zinc-400 dark:text-zinc-500">
                    {journeySubtitle}
                  </p>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={goHome}
                title={t('home')}
                aria-label={t('home')}
                className="flex cursor-pointer items-center gap-2.5"
              >
                <BrandMark theme={theme} size={28} />
                <span className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  ITRS DEM
                </span>
              </button>
            )}
          </div>

          {/* Desktop center — journey only */}
          <div className="hidden min-w-0 text-center md:block">
            {journeyTitle ? (
              <>
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {journeyTitle}
                </p>
                {journeySubtitle ? (
                  <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                    {journeySubtitle}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* —— Desktop right —— */}
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {themeButton()}
          {languageToggle()}
          <button
            type="button"
            onClick={openSignIn}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {t('signIn')}
          </button>
          <button
            type="button"
            onClick={onBookDemo}
            className="cursor-pointer rounded-lg bg-[#0071e3] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0077ed]"
          >
            {t('bookDemo')}
          </button>
        </div>

        {/* —— Mobile right: Book demo —— */}
        <button
          type="button"
          onClick={onBookDemo}
          className="shrink-0 cursor-pointer rounded-lg bg-[#0071e3] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0077ed] md:hidden"
        >
          {t('bookDemo')}
        </button>
      </header>

      {/* —— Mobile drawer: full-height overlay above the header —— */}
      {drawerMounted ? (
        <div className="fixed inset-0 z-[70] md:hidden" aria-hidden={!drawerEntered}>
          <button
            type="button"
            className={`absolute inset-0 cursor-pointer bg-black/40 ${
              drawerEntered ? 'pointer-events-auto' : 'pointer-events-none'
            }`}
            style={{
              opacity: drawerEntered ? 1 : 0,
              transition: `opacity ${DRAWER_MOTION_MS}ms ease-out`,
            }}
            aria-label={t('dismiss')}
            onClick={closeDrawer}
          />
          <nav
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
            className={`absolute inset-y-0 left-0 flex flex-col bg-[var(--color-surface)] shadow-[4px_0_24px_rgb(0_0_0_/_0.18)] will-change-transform ${
              drawerEntered ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{
              width: DRAWER_WIDTH,
              transition: `transform ${DRAWER_MOTION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
            }}
          >
            <p id={drawerTitleId} className="sr-only">
              {drawerView === 'settings' ? t('settings') : t('menu')}
            </p>

            <div className="flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
              {drawerView === 'settings' ? (
                <button
                  type="button"
                  onClick={() => setDrawerView('main')}
                  aria-label={t('back')}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-[18px] font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  <ChevronLeft size={22} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="truncate">{t('settings')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goHome}
                  title={t('home')}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5"
                >
                  <BrandMark theme={theme} size={28} />
                  <span className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    ITRS DEM
                  </span>
                </button>
              )}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closeDrawer}
                aria-label={t('dismiss')}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-700 transition hover:bg-zinc-200/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <X size={20} />
              </button>
            </div>

            {drawerView === 'main' ? (
              <div className="mt-auto flex flex-col gap-1.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={openSignIn}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left text-[16px] font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span>{t('signIn')}</span>
                  <LogIn size={22} className="shrink-0 text-zinc-400" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerView('settings')}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left text-[16px] font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <span>{t('settings')}</span>
                  <Settings size={22} className="shrink-0 text-zinc-400" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t('language')}
                  </p>
                  {languageToggle({ fullWidth: true, large: true })}
                </div>
                <div>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t('appearance')}
                  </p>
                  {themeButton({
                    withLabel: true,
                    iconSize: 22,
                    labelClassName: 'text-[16px] font-semibold',
                    className:
                      'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800',
                  })}
                </div>
              </div>
            )}
          </nav>
        </div>
      ) : null}
    </>
  )
}
