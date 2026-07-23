import { X } from 'lucide-react'

interface BookDemoModalProps {
  open: boolean
  onClose: () => void
}

export default function BookDemoModal({ open, onClose }: BookDemoModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in w-full max-w-md rounded-2xl bg-white p-6 dark:bg-zinc-900"
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="text-lg font-semibold tracking-tight dark:text-zinc-100">Book a demo</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-zinc-500">
          See ITRS DEM in action with your team — we&apos;ll reach out within one business day.
        </p>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            onClose()
          }}
        >
          <input
            type="text"
            required
            placeholder="Full name"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="email"
            required
            placeholder="Work email"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <input
            type="text"
            required
            placeholder="Company"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="submit"
            className="w-full cursor-pointer rounded-xl bg-[#0071e3] py-2.5 text-sm font-medium text-white transition hover:bg-[#0077ed]"
          >
            Request demo
          </button>
        </form>
      </div>
    </div>
  )
}
