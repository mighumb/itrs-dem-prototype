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

function BrandMark({
  theme,
  className = '',
}: {
  theme: 'light' | 'dark'
  className?: string
}) {
  // Light UI → dark glyph; dark UI → light glyph (assets named for the mode they serve).
  const src =
    theme === 'dark' ? '/itrs-favicon-dark-mode.svg' : '/itrs-favicon-light-mode.svg'
  return (
    <img
      src={src}
      alt=""
      width={22}
      height={21}
      className={`h-[22px] w-[22px] shrink-0 ${className}`}
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
  const [drawerView, setDrawerView] = useState<DrawerView>('main')
  const drawerTitleId = useId()
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { t, locale, setLocale } = useLocale()

  const closeDrawer = () => {
    setDrawerOpen(false)
    setDrawerView('main')
  }

  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()
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
      large ? 'min-h-11 px-3 py-2.5 text-[15px]' : 'px-2 py-1 text-xs'
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
        {/* —— Mobile left: burger —— */}
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-zinc-700 transition hover:bg-zinc-200/80 md:hidden dark:text-zinc-200 dark:hover:bg-zinc-800"
          aria-label={t('menu')}
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav-drawer"
          onClick={() => {
            setDrawerView('main')
            setDrawerOpen(true)
          }}
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
              <div className="flex items-center gap-2">
                <BrandMark theme={theme} />
                <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  ITRS DEM
                </span>
              </div>
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

      {/* —— Mobile drawer —— */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label={t('dismiss')}
            onClick={closeDrawer}
          />
          <nav
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
            className="absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] flex-col bg-[var(--color-surface)] shadow-xl animate-fade-in"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              {drawerView === 'settings' ? (
                <button
                  type="button"
                  id={drawerTitleId}
                  onClick={() => setDrawerView('main')}
                  aria-label={t('back')}
                  className="flex min-h-11 min-w-0 cursor-pointer items-center gap-1.5 text-[17px] font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  <ChevronLeft size={22} className="shrink-0 text-zinc-500" aria-hidden />
                  <span className="truncate">{t('settings')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  id={drawerTitleId}
                  onClick={goHome}
                  title={t('home')}
                  className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5"
                >
                  <BrandMark theme={theme} className="!h-7 !w-7" />
                  <span className="truncate text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    ITRS DEM
                  </span>
                </button>
              )}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={closeDrawer}
                aria-label={t('dismiss')}
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
