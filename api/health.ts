import type { VercelRequest, VercelResponse } from '@vercel/node'
import { geminiKeyRosterSnapshot } from './_lib/geminiHealth.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const gemini = geminiKeyRosterSnapshot()

  return res.status(gemini.ok ? 200 : 503).json({
    ok: gemini.ok,
    service: 'itrs-dem-prototype',
    at: new Date().toISOString(),
    apis: {
      discovery: '/api/discovery',
      journeyRun: '/api/journey-run',
      health: '/api/health',
    },
    gemini,
  })
}
