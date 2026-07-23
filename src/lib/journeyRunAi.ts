import type { BrowserFrame, JourneyStep } from '../types'

export type JourneyRunEvent =
  | { type: 'status'; text: string }
  | { type: 'step_start'; index: number; id: string; label: string }
  | {
      type: 'step_frame'
      index: number
      id: string
      label: string
      url: string
      title: string
      screenshotDataUrl: string
    }
  | { type: 'step_done'; index: number; id: string }
  | {
      type: 'step_failed'
      index: number
      id: string
      label: string
      error: string
      url?: string
      title?: string
      screenshotDataUrl?: string
    }
  | { type: 'done'; ok: boolean }
  | { type: 'error'; error: string }

export type LiveJourneyRunResult = {
  ok: boolean
  mode: 'playwright' | 'unavailable'
  error?: string
  failedStepIndex?: number
  failedStepLabel?: string
}

function frameFromEvent(event: {
  url?: string
  title?: string
  screenshotDataUrl?: string
}): BrowserFrame | null {
  if (!event.screenshotDataUrl && !event.url) return null
  return {
    url: event.url ?? 'about:blank',
    title: event.title ?? '',
    screenshotDataUrl: event.screenshotDataUrl,
  }
}

/**
 * Stream a real Playwright journey run from /api/journey-run.
 * Falls back to throwing if the runner is unavailable (caller may simulate).
 */
export async function runLiveJourney(options: {
  steps: Array<Pick<JourneyStep, 'id' | 'label' | 'action' | 'target'>>
  prompt?: string
  signal?: AbortSignal
  onEvent: (event: JourneyRunEvent) => void
  onFrame: (frame: BrowserFrame) => void
}): Promise<LiveJourneyRunResult> {
  const { steps, prompt, signal, onEvent, onFrame } = options

  const runnerUrl =
    (import.meta.env.VITE_JOURNEY_RUNNER_URL as string | undefined)?.replace(/\/$/, '') ||
    '/api/journey-run'

  let response: Response
  try {
    response = await fetch(runnerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      signal,
      body: JSON.stringify({
        prompt,
        steps: steps.map((s) => ({
          id: s.id,
          label: s.label,
          action: s.action,
          target: s.target,
        })),
      }),
    })
  } catch (error) {
    if (signal?.aborted) {
      return { ok: false, mode: 'unavailable', error: 'Aborted' }
    }
    throw error
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    return {
      ok: false,
      mode: 'unavailable',
      error: text || `Journey runner HTTP ${response.status}`,
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let failedStepIndex: number | undefined
  let failedStepLabel: string | undefined
  let sawDone = false
  let ok = true
  let lastError: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let event: JourneyRunEvent
      try {
        event = JSON.parse(trimmed) as JourneyRunEvent
      } catch {
        continue
      }

      onEvent(event)

      if (event.type === 'step_frame') {
        const frame = frameFromEvent(event)
        if (frame) onFrame(frame)
      }

      if (event.type === 'step_failed') {
        ok = false
        failedStepIndex = event.index
        failedStepLabel = event.label
        const frame = frameFromEvent(event)
        if (frame) onFrame(frame)
      }

      if (event.type === 'done') {
        sawDone = true
        ok = event.ok
      }

      if (event.type === 'error') {
        lastError = event.error
        ok = false
      }
    }
  }

  if (!sawDone && lastError) {
    return { ok: false, mode: 'unavailable', error: lastError }
  }

  return {
    ok,
    mode: 'playwright',
    error: lastError,
    failedStepIndex,
    failedStepLabel,
  }
}
