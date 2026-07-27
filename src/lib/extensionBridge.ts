/** Steps recorded by the ITRS DEM Chrome extension (dev / unpacked). */

export type RecordedBrowserStep = {
  id: string
  action: string
  label: string
  url: string
  href?: string
  targetHint?: string
  selector?: string
  at: number
}

type BridgeRequestType =
  | 'ping'
  | 'start_recording'
  | 'stop_recording'
  | 'get_steps'
  | 'get_state'
  | 'get_frame'
  | 'focus_recording_tab'
  | 'reopen_recording_tab'
  | 'clear_steps'

type BridgeResponse = {
  ok?: boolean
  installed?: boolean
  recording?: boolean
  steps?: RecordedBrowserStep[]
  stepCount?: number
  frame?: string | null
  frameUrl?: string | null
  recordingTabId?: number | null
  error?: string
}

const PAGE = 'itrs-dem'
const EXT = 'itrs-dem-extension'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.postMessage === 'function'
}

export function requestExtension<T extends BridgeResponse = BridgeResponse>(
  type: BridgeRequestType,
  options?: { timeoutMs?: number; url?: string | null },
): Promise<T> {
  if (!isBrowser()) {
    return Promise.resolve({ ok: false, installed: false, error: 'no_window' } as T)
  }

  const timeoutMs = options?.timeoutMs ?? 1200

  return new Promise((resolve) => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    let settled = false

    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      resolve({ ok: false, installed: false, error: 'timeout' } as T)
    }, timeoutMs)

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      const data = event.data as Record<string, unknown> | null
      if (!data || data.source !== EXT) return
      if (data.requestId !== requestId && data.type !== 'ready') return
      if (data.type === 'ready') return
      if (typeof data.type === 'string' && data.type.endsWith('_result')) {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        resolve({
          ok: Boolean(data.ok),
          installed: data.installed !== false,
          recording: Boolean(data.recording),
          steps: Array.isArray(data.steps) ? (data.steps as RecordedBrowserStep[]) : undefined,
          stepCount: typeof data.stepCount === 'number' ? data.stepCount : undefined,
          frame: typeof data.frame === 'string' ? data.frame : null,
          frameUrl: typeof data.frameUrl === 'string' ? data.frameUrl : null,
          recordingTabId: typeof data.recordingTabId === 'number' ? data.recordingTabId : null,
          error: typeof data.error === 'string' ? data.error : undefined,
        } as T)
      }
    }

    window.addEventListener('message', onMessage)
    window.postMessage(
      {
        source: PAGE,
        type,
        requestId,
        url: options?.url ?? undefined,
      },
      window.location.origin,
    )
  })
}

export async function pingExtension(): Promise<{ installed: boolean; recording: boolean }> {
  const res = await requestExtension('ping')
  return {
    installed: Boolean(res.installed && res.ok !== false && res.error !== 'timeout'),
    recording: Boolean(res.recording),
  }
}

export async function startExtensionRecording(url?: string | null): Promise<boolean> {
  const res = await requestExtension('start_recording', { url: url ?? null, timeoutMs: 2500 })
  return Boolean(res.ok && res.installed)
}

export async function stopExtensionRecording(): Promise<RecordedBrowserStep[]> {
  const res = await requestExtension('stop_recording', { timeoutMs: 2500 })
  return Array.isArray(res.steps) ? res.steps : []
}

export async function getExtensionSteps(): Promise<RecordedBrowserStep[]> {
  const res = await requestExtension('get_steps', { timeoutMs: 2000 })
  return Array.isArray(res.steps) ? res.steps : []
}

export async function getExtensionFrame(): Promise<{
  frame: string | null
  frameUrl: string | null
  stepCount: number
  recording: boolean
}> {
  const res = await requestExtension('get_frame', { timeoutMs: 1500 })
  return {
    frame: res.frame ?? null,
    frameUrl: res.frameUrl ?? null,
    stepCount: res.stepCount ?? 0,
    recording: Boolean(res.recording),
  }
}

/** Focus the recording tab, or reopen it at the last URL (keeps recorded steps). */
export async function focusRecordingTab(): Promise<boolean> {
  const res = await requestExtension('focus_recording_tab', { timeoutMs: 2500 })
  return Boolean(res.ok)
}

export async function reopenRecordingTab(): Promise<boolean> {
  const res = await requestExtension('reopen_recording_tab', { timeoutMs: 2500 })
  return Boolean(res.ok)
}

/** Listen for Stop & import from the Chrome recording-tab banner. */
export function subscribeImportRecording(
  onImport: (steps: RecordedBrowserStep[]) => void,
): () => void {
  if (!isBrowser()) return () => undefined

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data as Record<string, unknown> | null
    if (!data || data.source !== EXT) return
    if (data.type !== 'import_recording') return
    if (!Array.isArray(data.steps)) return
    onImport(data.steps as RecordedBrowserStep[])
  }

  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}
