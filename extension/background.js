/** @typedef {{ id: string, action: string, label: string, url: string, href?: string, targetHint?: string, selector?: string, at: number }} RecordedStep */

const STATE_KEY = 'itrsDemRecording'

/** @type {number | null} */
let recordingTabId = null
/** @type {string | null} */
let lastFrame = null
/** @type {string | null} */
let lastFrameUrl = null
/** @type {number | null} */
let captureTimer = null

async function getState() {
  const data = await chrome.storage.local.get(STATE_KEY)
  return (
    data[STATE_KEY] ?? {
      recording: false,
      steps: /** @type {RecordedStep[]} */ ([]),
      startedAt: null,
      openUrl: null,
    }
  )
}

async function setState(next) {
  await chrome.storage.local.set({
    [STATE_KEY]: next,
    itrsDemRecordingFlag: Boolean(next.recording),
    itrsDemStepCount: Array.isArray(next.steps) ? next.steps.length : 0,
    itrsDemRecordingTabId: recordingTabId,
  })
}

function stopCaptureLoop() {
  if (captureTimer != null) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

function startCaptureLoop() {
  stopCaptureLoop()
  captureTimer = setInterval(() => {
    void captureRecordingTab()
  }, 700)
}

async function captureRecordingTab() {
  if (!recordingTabId) return
  try {
    const tab = await chrome.tabs.get(recordingTabId)
    if (!tab || tab.discarded) return
    lastFrameUrl = tab.url || lastFrameUrl
    // captureVisibleTab only works when this tab is active in its window.
    if (!tab.active) return
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 42,
    })
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      lastFrame = dataUrl
    }
  } catch {
    // Tab closed or not capturable — ignore.
  }
}

async function openRecordingTab(url) {
  const target =
    typeof url === 'string' && /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : 'https://www.google.com/'

  const tab = await chrome.tabs.create({ url: target, active: true })
  recordingTabId = tab.id ?? null
  await chrome.storage.local.set({ itrsDemRecordingTabId: recordingTabId })
  return tab
}

async function focusRecordingTab() {
  if (!recordingTabId) return false
  try {
    const tab = await chrome.tabs.get(recordingTabId)
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }
    await chrome.tabs.update(recordingTabId, { active: true })
    return true
  } catch {
    return false
  }
}

chrome.runtime.onInstalled.addListener(() => {
  recordingTabId = null
  lastFrame = null
  void setState({ recording: false, steps: [], startedAt: null, openUrl: null })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId) {
    recordingTabId = null
    void chrome.storage.local.set({ itrsDemRecordingTabId: null })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      if (!message || typeof message !== 'object') {
        sendResponse({ ok: false, error: 'bad_message' })
        return
      }

      if (message.type === 'whoami') {
        sendResponse({ ok: true, tabId: sender.tab?.id ?? null })
        return
      }

      if (message.type === 'ping') {
        const state = await getState()
        sendResponse({
          ok: true,
          installed: true,
          recording: state.recording,
          stepCount: state.steps.length,
          recordingTabId,
          frameUrl: lastFrameUrl,
        })
        return
      }

      if (message.type === 'get_state') {
        const state = await getState()
        sendResponse({
          ok: true,
          ...state,
          stepCount: state.steps.length,
          recordingTabId,
          frameUrl: lastFrameUrl,
        })
        return
      }

      if (message.type === 'get_frame') {
        const state = await getState()
        sendResponse({
          ok: true,
          recording: state.recording,
          stepCount: state.steps.length,
          frame: lastFrame,
          frameUrl: lastFrameUrl,
          recordingTabId,
        })
        return
      }

      if (message.type === 'focus_recording_tab') {
        const focused = await focusRecordingTab()
        sendResponse({ ok: focused })
        return
      }

      if (message.type === 'start_recording') {
        const openUrl =
          typeof message.url === 'string' && message.url.trim() ? message.url.trim() : null
        await openRecordingTab(openUrl || 'https://www.google.com/')
        lastFrame = null
        lastFrameUrl = openUrl
        await setState({
          recording: true,
          steps: [],
          startedAt: Date.now(),
          openUrl,
        })
        startCaptureLoop()
        // Give the new tab a moment, then focus again (DEM page may steal focus).
        setTimeout(() => {
          void focusRecordingTab()
        }, 400)
        sendResponse({
          ok: true,
          recording: true,
          steps: [],
          recordingTabId,
          openedUrl: openUrl,
        })
        return
      }

      if (message.type === 'stop_recording') {
        const state = await getState()
        stopCaptureLoop()
        await setState({ ...state, recording: false })
        const next = await getState()
        sendResponse({
          ok: true,
          recording: false,
          steps: next.steps,
          frame: lastFrame,
        })
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
        // Prefer steps from the dedicated recording tab when known.
        if (
          recordingTabId != null &&
          sender.tab?.id != null &&
          sender.tab.id !== recordingTabId
        ) {
          sendResponse({ ok: true, ignored: true, steps: state.steps })
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
        if (typeof step.url === 'string') lastFrameUrl = step.url
        sendResponse({ ok: true, steps, stepCount: steps.length })
        return
      }

      if (message.type === 'get_steps') {
        const state = await getState()
        sendResponse({
          ok: true,
          steps: state.steps,
          recording: state.recording,
          frame: lastFrame,
          frameUrl: lastFrameUrl,
        })
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
