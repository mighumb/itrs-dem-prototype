import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  runJourneyWithPlaywright,
  type RunnableStep,
  type RunnerEvent,
} from './_lib/playwrightRunner.js'

function writeNdjson(res: VercelResponse, event: RunnerEvent | Record<string, unknown>) {
  res.write(`${JSON.stringify(event)}\n`)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = (req.body ?? {}) as {
    steps?: RunnableStep[]
    prompt?: string
  }

  const steps = Array.isArray(body.steps)
    ? body.steps.filter(
        (s): s is RunnableStep =>
          Boolean(s) &&
          typeof s === 'object' &&
          typeof s.id === 'string' &&
          typeof s.label === 'string' &&
          typeof s.action === 'string',
      )
    : []

  if (steps.length === 0) {
    return res.status(400).json({ error: 'steps[] required' })
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')

  const abort = new AbortController()
  req.on('close', () => abort.abort())

  try {
    await runJourneyWithPlaywright({
      steps: steps.slice(0, 12),
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
      signal: abort.signal,
      onEvent: async (event) => {
        if (abort.signal.aborted) return
        writeNdjson(res, event)
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Journey run failed'
    writeNdjson(res, { type: 'error', error: message })
  }

  return res.end()
}
