# ITRS DEM — Take Control (Chrome extension)

Record real clicks / navigations in **your** Chrome, see a **live mirror** in the DEM Browser panel, then import steps into the journey timeline.

Useful when sites block server-side Playwright (e.g. adidas.fr).

## Install (dev / unpacked — no Chrome Web Store)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder: `extension/` (contains `manifest.json`)
5. Keep the extension **enabled**
6. After pulling updates: click **Reload** on the extension card

## Use with the prototype

1. Open the DEM app and a journey workspace (page 2)
2. Browser panel → **Take control** → **Start recording**
3. Chrome **opens a tab automatically** (site URL when known) with a **red REC bar**
4. Browse **in that tab** (product, cart, …). The DEM panel shows a **live mirror** while the tab is focused
5. Watch the step counter increase → **Stop & import** (red bar on the Chrome tab **or** Browser panel)

## What you see where

| Place | Signal |
| --- | --- |
| **Chrome tab** | Red bar: `ITRS DEM · Enregistrement en cours` + **Arrêter et importer** |
| **ITRS Browser panel** | Red recording strip + step count + live screenshot mirror |
| **Agent chat** | Short caption + downloadable `.json` chip (not a raw JSON dump) |
| **Extension popup** | `Recording…` + step count |

If you accidentally close the Chrome tab: in the ITRS panel click **Show / reopen recording tab** — it reopens at the last URL and **keeps** steps already captured.

## Notes

- Interact in the **Chrome tab** (real site). The panel is a **mirror**, not a second interactive engine (free / no cloud browser).
- Passwords / sensitive fields are not recorded
- Max 80 steps per recording
