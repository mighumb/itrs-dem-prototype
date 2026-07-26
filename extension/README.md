# ITRS DEM — Take Control (Chrome extension)

Record real clicks / navigations in **your** Chrome, then import them into the ITRS DEM prototype as journey steps. Useful when sites block server-side Playwright (e.g. adidas.fr).

## Install (dev / unpacked — no Chrome Web Store)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder: `extension/` (the one that contains `manifest.json`)
5. Keep the extension **enabled**

You do **not** need Google review for this mode.

## Use with the prototype

1. Open the DEM app (`npm run dev` or the Vercel URL)
2. Start / open a journey workspace (page 2)
3. In the **Browser** panel, click **Take control**
4. Click **Start recording** (in the panel or the extension popup)
5. In another tab, browse the real site (product page, add to cart, …)
6. Return to DEM → **Stop & import steps**

The Steps timeline updates with what you did. You can then **Run** / edit as usual.

## Notes

- Password / sensitive fields are not recorded
- Max 80 steps per recording
- Works on `localhost`, `*.vercel.app`, and the GitHub Pages host via the page bridge
