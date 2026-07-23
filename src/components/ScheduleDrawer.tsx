import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { JourneySchedule } from '../types'
import { scheduleSummary } from '../types'

interface ScheduleDrawerProps {
  open: boolean
  initial: JourneySchedule
  onClose: () => void
  onConfirm: (schedule: JourneySchedule) => void
}

const FREQUENCIES = [
  'Every 5 minutes',
  'Every 15 minutes',
  'Every 30 minutes',
  'Every hour',
]

const LOCATIONS = ['Paris', 'Frankfurt', 'London', 'New York']

const ACTIVE_HOURS = ['24/7', 'Business hours only', 'Weekdays only']

export default function ScheduleDrawer({
  open,
  initial,
  onClose,
  onConfirm,
}: ScheduleDrawerProps) {
  const [frequency, setFrequency] = useState(initial.frequency)
  const [locations, setLocations] = useState<string[]>(initial.locations)
  const [activeHours, setActiveHours] = useState(initial.activeHours)

  if (!open) return null

  const draft: JourneySchedule = { frequency, locations, activeHours }

  const toggleLocation = (loc: string) => {
    setLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in flex h-full w-full max-w-md flex-col bg-white dark:bg-zinc-900"
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold tracking-tight dark:text-zinc-100">Schedule</h2>
            <p className="mt-0.5 text-sm text-zinc-500">When should this journey run?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
          <Field label="Frequency">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Locations">
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((loc) => {
                const selected = locations.includes(loc)
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => toggleLocation(loc)}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      selected
                        ? 'bg-[#0071e3] text-white'
                        : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    {loc}
                  </button>
                )
              })}
            </div>
          </Field>

          <Field label="Active">
            <select
              value={activeHours}
              onChange={(e) => setActiveHours(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {ACTIVE_HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </Field>

          <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Summary
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {scheduleSummary(draft)}
            </p>
          </div>
        </div>

        <footer className="border-t border-zinc-100 p-5 dark:border-zinc-800">
          <button
            type="button"
            disabled={locations.length === 0}
            onClick={() => onConfirm(draft)}
            className="w-full cursor-pointer rounded-xl bg-[#0071e3] py-2.5 text-sm font-medium text-white transition hover:bg-[#0077ed] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue — create account to activate
          </button>
          <p className="mt-3 text-center text-xs text-zinc-400">
            Monitoring starts after you sign up — nothing runs until then.
          </p>
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      {children}
    </div>
  )
}
