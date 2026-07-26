/**
 * Smoke-test: recorded JSON → journey steps → /api/journey-run screenshots.
 * Run: node scripts/test-recording-flow.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

function recordedStepsToJourneySteps(recorded) {
  const out = []
  let lastNav = ''
  for (const step of recorded) {
    const action = String(step.action || '').toLowerCase()
    const normalized =
      action === 'navigate' || action === 'open'
        ? 'Navigate'
        : action === 'type' || action === 'fill'
          ? 'Type'
          : action === 'verify' || action === 'check'
            ? 'Verify'
            : 'Click'
    if (normalized === 'Navigate') {
      const href = step.href || step.url
      if (!href || href === lastNav) continue
      lastNav = href
      out.push({
        id: step.id,
        label: step.label || href,
        action: 'Navigate',
        target: href,
        href,
        targetHint: step.targetHint || step.label,
      })
      continue
    }
    out.push({
      id: step.id,
      label: step.label || normalized,
      action: normalized,
      target: step.selector,
      href: step.href,
      targetHint: step.targetHint || step.label,
    })
  }
  return out
}

const mockRecording = [
  {
    id: 'nav-1',
    action: 'Navigate',
    label: 'Example Domain',
    url: 'https://example.com/',
    href: 'https://example.com/',
    at: Date.now(),
  },
  {
    id: 'click-1',
    action: 'Click',
    label: 'More information...',
    url: 'https://example.com/',
    href: 'https://www.iana.org/domains/example',
    targetHint: 'More information...',
    selector: 'a',
    at: Date.now() + 1,
  },
]

const steps = recordedStepsToJourneySteps(mockRecording)
console.log('1) Conversion OK:', steps.length, 'steps')
console.log(JSON.stringify(steps, null, 2))

if (steps.length < 1 || steps[0].action !== 'Navigate') {
  console.error('FAIL: expected Navigate first')
  process.exit(1)
}

const child = spawn('npx', ['tsx', 'server/journey-server.ts'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '8787' },
})

let ready = false
child.stdout.on('data', (buf) => {
  const s = buf.toString()
  process.stdout.write(`[journey] ${s}`)
  if (/8787|listening|ready/i.test(s)) ready = true
})
child.stderr.on('data', (buf) => process.stderr.write(`[journey:err] ${buf}`))

for (let i = 0; i < 40 && !ready; i++) await sleep(250)
// Even if no ready log, try the endpoint
await sleep(500)

console.log('2) Calling /api/journey-run …')
const res = await fetch('http://127.0.0.1:8787/api/journey-run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
  body: JSON.stringify({
    prompt: 'Recorded journey smoke test',
    steps,
  }),
})

if (!res.ok) {
  console.error('FAIL: journey-run HTTP', res.status, await res.text())
  child.kill('SIGTERM')
  process.exit(1)
}

const text = await res.text()
const events = text
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l)
    } catch {
      return null
    }
  })
  .filter(Boolean)

const frames = events.filter((e) => e.type === 'step_frame' && e.screenshotDataUrl)
const done = events.find((e) => e.type === 'done')
const errors = events.filter((e) => e.type === 'error' || e.type === 'step_failed')

console.log('3) Events:', events.map((e) => e.type).join(', '))
console.log('   Screenshots:', frames.length)
console.log(
  '   Screenshot bytes (approx):',
  frames.map((f) => Math.round((f.screenshotDataUrl?.length || 0) / 1024) + 'KB').join(', '),
)

child.kill('SIGTERM')

if (frames.length === 0) {
  console.error('FAIL: no screenshots returned')
  console.error(JSON.stringify(errors, null, 2))
  process.exit(1)
}

if (done && done.ok === false && frames.length === 0) {
  console.error('FAIL: run not ok and no frames')
  process.exit(1)
}

console.log('PASS: recording → steps → Playwright screenshots works')
process.exit(0)
