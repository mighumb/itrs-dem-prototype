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
  | 'clear_steps'

type BridgeResponse = {
  ok?: boolean
  installed?: boolean
  recording?: boolean
  steps?: RecordedBrowserStep[]
  stepCount?: number
  error?: string
}

const PAGE = 'itrs-dem'
const EXT = 'itrs-dem-extension'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.postMessage === 'function'
}

export function requestExtension<T extends BridgeResponse = BridgeResponse>(
  type: BridgeRequestType,
  timeoutMs = 1200,
): Promise<T> {
  if (!isBrowser()) {
    return Promise.resolve({ ok: false, installed: false, error: 'no_window' } as T)
  }

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
          error: typeof data.error === 'string' ? data.error : undefined,
        } as T)
      }
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ source: PAGE, type, requestId }, window.location.origin)
  })
}

export async function pingExtension(): Promise<{ installed: boolean; recording: boolean }> {
  const res = await requestExtension('ping')
  return {
    installed: Boolean(res.installed && res.ok !== false && res.error !== 'timeout'),
    recording: Boolean(res.recording),
  }
}

export async function startExtensionRecording(): Promise<boolean> {
  const res = await requestExtension('start_recording')
  return Boolean(res.ok && res.installed)
}

export async function stopExtensionRecording(): Promise<RecordedBrowserStep[]> {
  const res = await requestExtension('stop_recording', 2000)
  return Array.isArray(res.steps) ? res.steps : []
}

export async function getExtensionSteps(): Promise<RecordedBrowserStep[]> {
  const res = await requestExtension('get_steps', 2000)
  return Array.isArray(res.steps) ? res.steps : []
}
