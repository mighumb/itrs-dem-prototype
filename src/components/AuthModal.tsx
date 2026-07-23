import { X } from 'lucide-react'

export type AuthMode = 'login' | 'signup'

interface AuthModalProps {
  open: boolean
  mode: AuthMode
  onClose: () => void
  onSuccess: () => void
  onSwitchMode: (mode: AuthMode) => void
}

export default function AuthModal({
  open,
  mode,
  onClose,
  onSuccess,
  onSwitchMode,
}: AuthModalProps) {
  if (!open) return null

  const isLogin = mode === 'login'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900"
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold tracking-tight dark:text-zinc-100">
            {isLogin ? 'Log in' : 'Create account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-zinc-500">
          {isLogin
            ? 'Welcome back — pick up where you left off.'
            : 'Start monitoring your journeys for free.'}
        </p>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onSuccess()
          }}
        >
          <input
            type="email"
            required
            placeholder="Work email"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="password"
            required
            placeholder="Password"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl bg-[#0071e3] py-2.5 text-sm font-medium text-white transition hover:bg-[#0077ed]"
          >
            {isLogin ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => onSwitchMode(isLogin ? 'signup' : 'login')}
            className="cursor-pointer font-medium text-[#0071e3] hover:underline"
          >
            {isLogin ? 'Create account' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}
