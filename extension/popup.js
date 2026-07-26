const statusEl = document.getElementById('status')
const countEl = document.getElementById('count')
const startBtn = document.getElementById('start')
const stopBtn = document.getElementById('stop')

function paint(state) {
  const recording = Boolean(state?.recording)
  const n = Array.isArray(state?.steps) ? state.steps.length : state?.stepCount || 0
  statusEl.textContent = recording ? 'Recording…' : 'Ready'
  statusEl.style.color = recording ? '#dc2626' : '#0071e3'
  countEl.textContent = `${n} step${n === 1 ? '' : 's'}`
  startBtn.disabled = recording
  stopBtn.disabled = !recording && n === 0
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'get_state' })
  paint(state)
}

startBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'start_recording' })
  await refresh()
})

stopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'stop_recording' })
  await refresh()
})

void refresh()
