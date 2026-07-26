/** @typedef {{ id: string, action: string, label: string, url: string, href?: string, targetHint?: string, selector?: string, at: number }} RecordedStep */

const STATE_KEY = 'itrsDemRecording'

async function getState() {
  const data = await chrome.storage.local.get(STATE_KEY)
  return (
    data[STATE_KEY] ?? {
      recording: false,
      steps: /** @type {RecordedStep[]} */ ([]),
      startedAt: null,
    }
  )
}

async function setState(next) {
  await chrome.storage.local.set({
    [STATE_KEY]: next,
    itrsDemRecordingFlag: Boolean(next.recording),
    itrsDemStepCount: Array.isArray(next.steps) ? next.steps.length : 0,
  })
}

chrome.runtime.onInstalled.addListener(() => {
  void setState({ recording: false, steps: [], startedAt: null })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      if (!message || typeof message !== 'object') {
        sendResponse({ ok: false, error: 'bad_message' })
        return
      }

      if (message.type === 'ping') {
        const state = await getState()
        sendResponse({
          ok: true,
          installed: true,
          recording: state.recording,
          stepCount: state.steps.length,
        })
        return
      }

      if (message.type === 'get_state') {
        const state = await getState()
        sendResponse({ ok: true, ...state, stepCount: state.steps.length })
        return
      }

      if (message.type === 'start_recording') {
        await setState({
          recording: true,
          steps: [],
          startedAt: Date.now(),
        })
        sendResponse({ ok: true, recording: true, steps: [] })
        return
      }

      if (message.type === 'stop_recording') {
        const state = await getState()
        await setState({ ...state, recording: false })
        const next = await getState()
        sendResponse({ ok: true, recording: false, steps: next.steps })
        return
      }

      if (message.type === 'clear_steps') {
        const state = await getState()
        await setState({ ...state, steps: [] })
        sendResponse({ ok: true, steps: [] })
        return
      }

      if (message.type === 'add_step' && message.step) {
        const state = await getState()
        if (!state.recording) {
          sendResponse({ ok: false, error: 'not_recording' })
          return
        }
        const step = message.step
        const last = state.steps[state.steps.length - 1]
        if (
          last &&
          last.action === step.action &&
          last.label === step.label &&
          last.url === step.url &&
          step.at - last.at < 600
        ) {
          sendResponse({ ok: true, steps: state.steps, deduped: true })
          return
        }
        const steps = [...state.steps, step].slice(0, 80)
        await setState({ ...state, steps })
        sendResponse({ ok: true, steps, stepCount: steps.length })
        return
      }

      if (message.type === 'get_steps') {
        const state = await getState()
        sendResponse({ ok: true, steps: state.steps, recording: state.recording })
        return
      }

      sendResponse({ ok: false, error: 'unknown_type' })
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'unknown',
      })
    }
  })()
  return true
})
