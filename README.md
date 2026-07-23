# ITRS DEM — Phase 1 Prototype

Interactive **frontend-only** prototype for validating the business-user journey creation flow.

## Live preview

- **Vercel (AI chat):** https://itrs-dem-prototype.vercel.app
- **GitHub Pages:** https://mighumb.github.io/itrs-dem-prototype/

## Stack

- **React 19** + **Vite** + **TypeScript**
- **Tailwind CSS v4**
- **Lucide React** (icons)
- No backend — all data mocked

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

## What's fake

- Agent responses (pre-scripted with delays)
- Browser preview (simulated viewport, not real Playwright)
- KPIs and failing step (mock data)
- Auth / signup (no API)

## Phase 2 (not included)

- Dashboard, Journeys list, Schedule panel
- Real browser streaming (Playwright)
- RBAC, Infrastructure, MCP API
