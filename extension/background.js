/** @typedef {{ id: string, action: string, label: string, url: string, href?: string, targetHint?: string, selector?: string, at: number }} RecordedStep */

const STATE_KEY = 'itrsDemRecording'

/** Root tab opened by Take control. */
/** @type {number | null} */
let sourceTabId = null
/** Source + tabs/windows opened from the lineage (openerTabId chain). */
/** @type {Set<number>} */
const recordingTabIds = new Set()

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

/** Restore in-memory lineage after service worker restart. */
async function hydrateLineageFromStorage() {
  const data = await chrome.storage.local.get([
    'itrsDemRecordingTabIds',
    'itrsDemRecordingTabId',
    STATE_KEY,
  ])
  const ids = Array.isArray(data.itrsDemRecordingTabIds)
    ? data.itrsDemRecordingTabIds.filter((id) => typeof id === 'number')
    : typeof data.itrsDemRecordingTabId === 'number'
      ? [data.itrsDemRecordingTabId]
      : []
  recordingTabIds.clear()
  for (const id of ids) recordingTabIds.add(id)
  sourceTabId =
    typeof data.itrsDemRecordingTabId === 'number'
      ? data.itrsDemRecordingTabId
      : ids[0] ?? null
  const state = data[STATE_KEY]
  if (state?.recording && recordingTabIds.size > 0) {
    startCaptureLoop()
  }
}

void hydrateLineageFromStorage()

async function persistLineage() {
  const ids = [...recordingTabIds]
  await chrome.storage.local.set({
    itrsDemRecordingTabIds: ids,
    // Back-compat: primary/source id (content scripts prefer the array).
    itrsDemRecordingTabId: sourceTabId,
  })
}

async function setState(next) {
  await chrome.storage.local.set({
    [STATE_KEY]: next,
    itrsDemRecordingFlag: Boolean(next.recording),
    itrsDemStepCount: Array.isArray(next.steps) ? next.steps.length : 0,
    itrsDemRecordingTabIds: [...recordingTabIds],
    itrsDemRecordingTabId: sourceTabId,
  })
}

function clearLineage() {
  recordingTabIds.clear()
  sourceTabId = null
}

function addToLineage(tabId) {
  if (typeof tabId !== 'number') return false
  if (recordingTabIds.has(tabId)) return false
  recordingTabIds.add(tabId)
  return true
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

/** Prefer an active lineage tab; fall back to source. */
async function resolveCaptureTab() {
  if (recordingTabIds.size === 0) return null
  try {
    const tabs = await chrome.tabs.query({ active: true })
    const activeInLineage = tabs.find((tab) => tab.id != null && recordingTabIds.has(tab.id))
    if (activeInLineage?.id != null) return activeInLineage
  } catch {
    // continue
  }
  const preferred = sourceTabId ?? [...recordingTabIds][0]
  if (preferred == null) return null
  try {
    return await chrome.tabs.get(preferred)
  } catch {
    return null
  }
}

async function captureRecordingTab() {
  if (recordingTabIds.size === 0) return
  try {
    const tab = await resolveCaptureTab()
    if (!tab || tab.discarded || tab.id == null) return
    lastFrameUrl = tab.url || lastFrameUrl
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
  clearLineage()
  sourceTabId = tab.id ?? null
  if (sourceTabId != null) recordingTabIds.add(sourceTabId)
  await persistLineage()
  return tab
}

function resolveResumeUrl(state) {
  if (lastFrameUrl && /^https?:\/\//i.test(lastFrameUrl)) return lastFrameUrl
  if (typeof state?.openUrl === 'string' && /^https?:\/\//i.test(state.openUrl)) {
    return state.openUrl
  }
  const steps = Array.isArray(state?.steps) ? state.steps : []
  for (let i = steps.length - 1; i >= 0; i--) {
    const candidate = steps[i]?.href || steps[i]?.url
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate
    }
  }
  return 'https://www.google.com/'
}

/** Focus a lineage tab, or reopen at the last URL without clearing steps. */
async function focusOrReopenRecordingTab() {
  // Prefer source, then any remaining lineage tab.
  const candidates = [
    sourceTabId,
    ...[...recordingTabIds].filter((id) => id !== sourceTabId),
  ].filter((id) => typeof id === 'number')

  for (const id of candidates) {
    try {
      const tab = await chrome.tabs.get(id)
      if (tab?.id != null) {
        if (tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true })
        }
        await chrome.tabs.update(id, { active: true })
        return { ok: true, reopened: false, url: tab.url || lastFrameUrl }
      }
    } catch {
      recordingTabIds.delete(id)
      if (sourceTabId === id) sourceTabId = null
    }
  }

  const state = await getState()
  if (!state.recording) {
    return { ok: false, reopened: false, error: 'not_recording' }
  }

  const url = resolveResumeUrl(state)
  await openRecordingTab(url)
  lastFrameUrl = url
  startCaptureLoop()
  const tabId = sourceTabId
  setTimeout(() => {
    if (tabId == null) return
    void chrome.tabs.update(tabId, { active: true }).catch(() => undefined)
  }, 350)
  return { ok: true, reopened: true, url }
}

function isDemAppUrl(url) {
  try {
    const host = new URL(url).hostname
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.vercel.app') ||
      host === 'mighumb.github.io'
    )
  } catch {
    return false
  }
}

async function stopRecordingInternal() {
  const state = await getState()
  stopCaptureLoop()
  clearLineage()
  await setState({ ...state, recording: false })
  return getState()
}

async function abortRecordingInternal() {
  stopCaptureLoop()
  clearLineage()
  lastFrame = null
  await setState({
    recording: false,
    steps: [],
    startedAt: null,
    openUrl: null,
  })
  return getState()
}

/** Push recorded steps to open DEM app tabs and focus one. */
async function notifyDemTabsImport(steps) {
  const tabs = await chrome.tabs.query({})
  const demTabs = tabs.filter((tab) => typeof tab.url === 'string' && isDemAppUrl(tab.url))
  for (const tab of demTabs) {
    if (tab.id == null) continue
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'import_recording', steps })
    } catch {
      // Content bridge may not be injected yet — ignore.
    }
  }
  const focus = demTabs[0]
  if (focus?.id != null) {
    try {
      if (focus.windowId != null) {
        await chrome.windows.update(focus.windowId, { focused: true })
      }
      await chrome.tabs.update(focus.id, { active: true })
    } catch {
      // ignore
    }
  }
  return demTabs.length
}

async function notifyDemTabsAbort() {
  const tabs = await chrome.tabs.query({})
  const demTabs = tabs.filter((tab) => typeof tab.url === 'string' && isDemAppUrl(tab.url))
  for (const tab of demTabs) {
    if (tab.id == null) continue
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'abort_recording' })
    } catch {
      // ignore
    }
  }
  return demTabs.length
}

function lineagePayload() {
  return {
    recordingTabId: sourceTabId,
    recordingTabIds: [...recordingTabIds],
  }
}

// Child tabs / windows opened from a lineage tab join the recording set.
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id == null) return
  const opener = tab.openerTabId
  if (typeof opener === 'number' && recordingTabIds.has(opener)) {
    if (addToLineage(tab.id)) void persistLineage()
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!recordingTabIds.has(tabId)) return
  recordingTabIds.delete(tabId)
  if (sourceTabId === tabId) {
    sourceTabId = [...recordingTabIds][0] ?? null
  }
  void persistLineage()
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      if (!message || typeof message !== 'object') {
        sendResponse({ ok: false, error: 'bad_message' })
        return
      }

      if (message.type === 'whoami') {
        sendResponse({
          ok: true,
          tabId: sender.tab?.id ?? null,
          inLineage:
            typeof sender.tab?.id === 'number' && recordingTabIds.has(sender.tab.id),
        })
        return
      }

      if (message.type === 'ping') {
        const state = await getState()
        sendResponse({
          ok: true,
          installed: true,
          recording: state.recording,
          stepCount: state.steps.length,
          frameUrl: lastFrameUrl,
          ...lineagePayload(),
        })
        return
      }

      if (message.type === 'get_state') {
        const state = await getState()
        sendResponse({
          ok: true,
          ...state,
          stepCount: state.steps.length,
          frameUrl: lastFrameUrl,
          ...lineagePayload(),
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
          ...lineagePayload(),
        })
        return
      }

      if (
        message.type === 'focus_recording_tab' ||
        message.type === 'reopen_recording_tab'
      ) {
        const result = await focusOrReopenRecordingTab()
        sendResponse(result)
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
        setTimeout(() => {
          void focusOrReopenRecordingTab()
        }, 400)
        sendResponse({
          ok: true,
          recording: true,
          steps: [],
          openedUrl: openUrl,
          ...lineagePayload(),
        })
        return
      }

      if (message.type === 'stop_recording') {
        const next = await stopRecordingInternal()
        sendResponse({
          ok: true,
          recording: false,
          steps: next.steps,
          frame: lastFrame,
          ...lineagePayload(),
        })
        return
      }

      if (message.type === 'stop_and_import') {
        const next = await stopRecordingInternal()
        const steps = Array.isArray(next.steps) ? next.steps : []
        const notified = await notifyDemTabsImport(steps)
        sendResponse({
          ok: true,
          recording: false,
          steps,
          notified,
          frame: lastFrame,
          ...lineagePayload(),
        })
        return
      }

      if (message.type === 'abort_recording') {
        await abortRecordingInternal()
        const notified = await notifyDemTabsAbort()
        sendResponse({
          ok: true,
          recording: false,
          steps: [],
          aborted: true,
          notified,
          ...lineagePayload(),
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
        // Only accept steps from tabs in the recording lineage.
        if (
          recordingTabIds.size > 0 &&
          sender.tab?.id != null &&
          !recordingTabIds.has(sender.tab.id)
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
          ...lineagePayload(),
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
