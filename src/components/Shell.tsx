import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

interface ShellProps {
  children: ReactNode
  minimal?: boolean
  onHome?: () => void
}

export default function Shell({ children, minimal, onHome }: ShellProps) {
  const { theme, toggleTheme } = useTheme()

  if (minimal) {
    return <div className="h-full">{children}</div>
  }

  return (
    <div className="flex min-h-full">
      <nav className="hidden w-52 shrink-0 flex-col border-r border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/80 md:flex">
        <div className="mb-8 flex items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={onHome}
            title="Home"
            className="cursor-pointer text-sm font-semibold tracking-tight transition hover:opacity-70 dark:text-zinc-100"
          >
            ITRS DEM
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <ul className="space-y-1 text-sm">
          {['Home', 'Dashboard', 'Journeys'].map((item, i) => (
            <li key={item}>
              <span
                className={`block rounded-lg px-3 py-2 ${
                  i === 0
                    ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {item}
                {i > 0 && (
                  <span className="ml-1.5 text-[10px] font-normal text-zinc-300">
                    Phase 2
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
