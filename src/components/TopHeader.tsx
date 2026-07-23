import { ChevronDown, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

export default function TopHeader({
  onLogIn,
  onSignUp,
  onBookDemo,
  onHome,
  journeyTitle,
  journeySubtitle,
}: TopHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const { t, locale, setLocale } = useLocale()

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <header className="flex shrink-0 items-center gap-4 bg-[var(--color-surface)] px-4 py-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onHome}
          title={t('home')}
          className="cursor-pointer text-sm font-semibold tracking-tight text-zinc-900 transition hover:opacity-70 dark:text-zinc-100"
        >
          ITRS DEM
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? t('lightMode') : t('darkMode')}
          aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
          className="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {journeyTitle && (
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {journeyTitle}
          </p>
          {journeySubtitle && (
            <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{journeySubtitle}</p>
          )}
        </div>
      )}

      <div className={`flex shrink-0 items-center gap-2 ${journeyTitle ? '' : 'ml-auto'}`}>
        <div
          className="flex items-center rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700"
          role="group"
          aria-label={t('language')}
        >
          <button
            type="button"
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            className={`cursor-pointer rounded-md px-2 py-1 text-xs font-semibold tracking-wide transition ${
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
            className={`cursor-pointer rounded-md px-2 py-1 text-xs font-semibold tracking-wide transition ${
              locale === 'fr'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            FR
          </button>
        </div>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={`flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              menuOpen
                ? 'bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-zinc-700 hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
            }`}
          >
            {t('signIn')}
            <ChevronDown
              size={14}
              className={`text-zinc-400 transition dark:text-zinc-500 ${menuOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onLogIn()
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('logIn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onSignUp()
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t('createAccount')}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onBookDemo}
          className="cursor-pointer rounded-lg bg-[#0071e3] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0077ed]"
        >
          {t('bookDemo')}
        </button>
      </div>
    </header>
  )
}
