/**
 * Local Playwright journey runner (NDJSON).
 * Used by Vite dev proxy — Vercel serves api/journey-run.ts in production.
 *
 *   npm run journey:server
 */
import http from 'node:http'
import {
  runJourneyWithPlaywright,
  type RunnableStep,
} from '../api/_lib/playwrightRunner.ts'

const PORT = Number(process.env.JOURNEY_SERVER_PORT || 8787)

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'journey-runner' }))
    return
  }

  if (req.method !== 'POST' || req.url !== '/api/journey-run') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
    return
  }

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  let body: { steps?: RunnableStep[]; prompt?: string } = {}
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as typeof body
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  const steps = Array.isArray(body.steps) ? body.steps.slice(0, 12) : []
  if (steps.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'steps[] required' }))
    return
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Access-Control-Allow-Origin': '*',
    Connection: 'keep-alive',
  })

  const abort = new AbortController()
  req.on('close', () => abort.abort())

  await runJourneyWithPlaywright({
    steps,
    prompt: body.prompt,
    signal: abort.signal,
    onEvent: (event) => {
      if (abort.signal.aborted) return
      res.write(`${JSON.stringify(event)}\n`)
    },
  })

  res.end()
})

server.listen(PORT, () => {
  console.log(`[journey-server] Playwright runner on http://localhost:${PORT}`)
  console.log(`[journey-server] POST /api/journey-run`)
})
