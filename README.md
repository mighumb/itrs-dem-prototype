# ITRS DEM — Phase 1 Prototype

Interactive **frontend-only** prototype for validating the business-user journey creation flow.

## Live preview

- **Vercel (AI chat):** https://itrs-dem-prototype.vercel.app
- **GitHub Pages:** https://mighumb.github.io/itrs-dem-prototype/

## Stack

- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS v4**
- **Lucide React** (icons)
- **Playwright** journey runner (real step screenshots in the Browser panel)
- Discovery chat via Gemini (`/api/discovery`)

## Layout (integrated workspace)

- **Agent** — fixed left column
- **Steps** — middle column; **Edit** widens it; inline step editing
- **Browser** — shrinks when Monitoring opens; minimizable in Edit mode
- **Monitoring** — 4th column (not overlay); closed by default until preview run

## Flow (Phase 1)

1. **Home** — conversational discovery (questionnaire, journey proposals, plan, then Run)
2. **New Journey** — integrated 4-column workspace (Agent / Steps / Browser / Monitoring)
3. **Monitoring** — opens after the first run
4. **Save modal** — signup prompt (Try → Save model)

## Playwright runner (real Browser screenshots)

The Browser panel shows **real Playwright screenshots** during journey runs.

### On Vercel (production)

`/api/journey-run` launches Chromium via `@sparticuz/chromium` (serverless-compatible).  
No separate host required for the basic live-capture path.

Limits to expect: ~60s function timeout, cold starts, and sites that block datacenter bots.

### Local

```bash
npm install
npx playwright install chromium
npm run journey:server   # http://localhost:8787 — keep this running
npm run dev              # Vite proxies /api/journey-run → :8787
```

### Optional dedicated Docker worker

```bash
docker build -f services/playwright-runner/Dockerfile -t itrs-journey-runner .
docker run -p 8787:8787 itrs-journey-runner
```

Point the frontend with `VITE_JOURNEY_RUNNER_URL=https://your-runner.example/api/journey-run`.

If the runner is down, the UI falls back to simulated frames and says so in chat.

## Discovery (Gemini)

Set on Vercel → Project → Settings → Environment Variables (Production + Preview):

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Primary free-tier Google AI Studio key |
| `GEMINI_API_KEY_2` | no | Free-tier failover (ideally another **project**) when key #1 hits 429 |
| `GEMINI_API_KEY_3`…`_5` | no | Extra free-tier failovers |
| `GEMINI_API_KEYS` | no | Optional comma-separated free-tier list |
| `GOOGLE_API_IP_LABEL` | no | **Last resort** billed key — used only after free keys fail on quota |
| `GEMINI_MODEL` | no | Preferred model id (still fails over to other Flash models) |

On each Discovery request the API tries keys in that order (free first, billed last). After a free-tier reset, the next request starts again on `GEMINI_API_KEY` — it does not stick on the paid key.
## What's still mocked

- Monitoring KPIs / random failure injection (simulation fallback only)
- Auth / signup (no API)
- Take control (button only)

## Phase 2 (not included)

- Dashboard, Journeys list, Schedule panel
- Persistent journey storage, RBAC, MCP API
- Cookie/login vault for authenticated journeys
