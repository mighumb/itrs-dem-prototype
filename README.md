# ITRS DEM — Phase 1 Prototype

Interactive **frontend-only** prototype for validating the business-user journey creation flow.

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

1. **Home** — minimal onboarding, input + suggestions
2. **New Journey** — integrated 4-column workspace (3 visible by default)
3. **See monitoring preview** — opens 4th column after journey complete
4. **Save modal** — signup prompt (Try → Save model)

## Preview

The prototype is deployed on GitHub Pages — open it here:

**https://mighumb.github.io/itrs-dem-prototype/**

## What's fake

- Agent responses (pre-scripted with delays)
- Browser preview (simulated viewport, not real Playwright)
- KPIs and failing step (mock data)
- Auth / signup (no API)

## Phase 2 (not included)

- Dashboard, Journeys list, Schedule panel
- Real browser streaming (Playwright)
- RBAC, Infrastructure, MCP API
