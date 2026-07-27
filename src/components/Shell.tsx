import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'
import type { MessageKey } from '../i18n/messages'

interface ShellProps {
  children: ReactNode
  minimal?: boolean
  /** Lock to parent height so workspace panels fill the viewport (no document scroll). */
  fillViewport?: boolean
  onHome?: () => void
}

const NAV_ITEMS: { key: MessageKey; phase2?: boolean }[] = [
  { key: 'home' },
  { key: 'dashboard', phase2: true },
  { key: 'journeys', phase2: true },
]

export default function Shell({ children, minimal, fillViewport, onHome }: ShellProps) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLocale()

  if (minimal) {
    // Home: document scroll for native pull-to-refresh.
    // Workspace: fill parent height so panels scroll internally.
    return (
      <div
        className={
          fillViewport
            ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
            : 'flex min-h-full flex-1 flex-col'
        }
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={
        fillViewport
          ? 'flex h-full min-h-0 overflow-hidden'
          : 'flex min-h-full'
      }
    >
      <nav className="hidden w-52 shrink-0 flex-col border-r border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/80 md:flex">
        <div className="mb-8 flex items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={onHome}
            title={t('home')}
            className="cursor-pointer text-sm font-semibold tracking-tight transition hover:opacity-70 dark:text-zinc-100"
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
        <ul className="space-y-1 text-sm">
          {NAV_ITEMS.map((item, i) => (
            <li key={item.key}>
              <span
                className={`block rounded-lg px-3 py-2 ${
                  i === 0
                    ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {t(item.key)}
                {item.phase2 ? (
                  <span className="ml-1.5 text-[10px] font-normal text-zinc-300">{t('phase2')}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </nav>
      <main
        className={
          fillViewport
            ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
            : 'min-w-0 flex-1'
        }
      >
        {children}
      </main>
    </div>
  )
}
