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

## Take control (Chrome extension — free / local)

When a site blocks server-side Playwright (bot protection), record the journey in **your** Chrome:

1. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select the repo’s `extension/` folder  
2. Open a journey workspace → Browser panel → **Take control**  
3. **Start recording** → browse the real site in another tab → **Stop & import steps**

Details: [`extension/README.md`](./extension/README.md). No Chrome Web Store review required for unpacked/dev mode.

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
| `GEMINI_API_KEY` | yes | Primary free-tier key — model **`gemini-2.5-flash`** |
| `GEMINI_API_KEY_2` | no | Free-tier failover — same **`gemini-2.5-flash`** |
| `GEMINI_API_KEY_3`…`_5` | no | Extra free-tier failovers |
| `GEMINI_API_KEYS` | no | Optional comma-separated free-tier list |
| `GOOGLE_API_IP_LABEL` | no | **Last resort** billed key — also **`gemini-2.5-flash`** (prototype cost control) |
| `GEMINI_MODEL` | no | Optional override for Flash model preference |

On each Discovery request: all keys use Flash 2.5 (no Pro / no 3.6). If free keys fail on quota, paid key is last resort but still on Flash. After a free-tier reset, the next request starts again on `GEMINI_API_KEY`.

## Homepage sample journeys

Idle Home shows four company cards (Salesforce, AXA, Amazon, Airbnb): logo + company name + short journey title. Click runs the real Gemini Discovery pipeline in `configure` mode (journey type already chosen). The agent asks for user params (email, search query, city, etc.) only when steps need them — never invents secrets. Sample seeds favor Navigate/Click/Type with at most one final Verify.

Workspace runs always come from the Discovery plan (or a minimal URL-derived journey if only a prompt is known). There is no hard-coded Nike / Trainline / Booking mock template — Playwright executes the steps for the journey the user asked for.

## What's still mocked

- Monitoring KPIs / random failure injection (simulation fallback only)
- Auth / signup (no API)
- Take control (button only)
- Cookie/login vault (agent may ask for credentials when a journey needs them; session-only)

## Phase 2 (not included)

- Dashboard, Journeys list, Schedule panel
- Persistent journey storage, RBAC, MCP API
- Persistent cookie/login vault for authenticated journeys
