# Dev cheat sheet — ASTRA Browser Bridge

1. `chrome://extensions` → Developer mode **ON** → *Load unpacked* → select `astra/browser-extension/`; after every edit hit the ↻ on the extension card.
2. Start the app first (`npm run dev` in `astra/`) so `%APPDATA%\ASTRA\native\port.json` exists; the host needs it within 30 s of spawn.
3. Inspect problems: `chrome://extensions` → ASTRA → **service worker** link (background logs `[astra-bg] …`), page DevTools console shows content-script errors.
4. Cursor tweaks live in `cursor.css` (keyframes `astra-*`); registry/actions in `content.js`; reconnect/backoff in `background.js` (`RECONNECT_DELAYS_MS`).
5. Full protocol reference: `docs/CONTRACTS.md` §10 — envelope `{id, action, payload}` → `{id, ok, data|error}`; test the pipe with action `ping`.
