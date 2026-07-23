import { X } from 'lucide-react'
import type { JourneySchedule } from '../types'
import { scheduleSummary } from '../types'

interface SaveModalProps {
  open: boolean
  schedule: JourneySchedule | null
  onClose: () => void
  onSave: () => void
}

export default function SaveModal({ open, schedule, onClose, onSave }: SaveModalProps) {
  if (!open) return null

  const withSchedule = schedule !== null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900"
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold tracking-tight dark:text-zinc-100">
            {withSchedule ? 'Start monitoring' : 'Save your journey'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X size={18} />
          </button>
        </div>

        {withSchedule ? (
          <>
            <p className="mb-3 text-sm leading-relaxed text-zinc-500">
              Create a free account to activate monitoring on this schedule.
            </p>
            <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Schedule
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {scheduleSummary(schedule)}
              </p>
            </div>
          </>
        ) : (
          <p className="mb-6 text-sm leading-relaxed text-zinc-500">
            Create a free account to save and monitor this journey continuously.
          </p>
        )}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onSave()
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
            className="w-full rounded-xl bg-[#0071e3] py-2.5 text-sm font-medium text-white transition hover:bg-[#0077ed]"
          >
            {withSchedule ? 'Create account & start monitoring' : 'Create account & save'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-zinc-400">
          No credit card required · 12 runs/day on free plan
        </p>
      </div>
    </div>
  )
}
