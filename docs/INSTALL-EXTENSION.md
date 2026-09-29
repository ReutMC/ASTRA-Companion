# Install the ASTRA Browser Bridge extension

Chrome (and Edge) do not allow installers to silently add extensions — that is a
browser security guarantee, not a limitation of ASTRA. ASTRA therefore registers
the **Native Messaging Host** automatically (that part is legitimate and done by
the installer), and the extension itself is loaded once, manually, transparently.

## Steps (Chrome)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `browser-extension` folder:
   - From the repo: `<repo>/browser-extension`
   - From an installed ASTRA: `C:\Users\<you>\AppData\Local\Programs\ASTRA\resources\app.asar.unpacked\..\..\..\browser-extension`
     (if not present in the install, use the repo folder)
5. Click the **puzzle icon** → pin **ASTRA Browser Bridge**
6. Open its popup → press **Copy** to copy the **Extension ID** (32 letters)
7. Open ASTRA → **Settings → Browser** → paste the Extension ID → **Register Native Messaging Host**
8. **Restart Chrome**
9. Popup should now show **CONNECTED** (with ASTRA running)

## Steps (Edge)

Same as above with `edge://extensions`; ASTRA registers the host for Edge as well.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Popup shows NOT RUNNING | Is the ASTRA desktop app running? Check tray. |
| "Chrome connection unavailable" from a tool | Extension loaded? ID registered in ASTRA settings? Chrome restarted after registering? |
| Actions fail on a page | Chrome Web Store / chrome:// pages are restricted by the browser itself. Try a normal website. |
| Changed ASTRA port | Press "Register Native Messaging Host" again, restart Chrome. |

## What the extension can access

- It only talks to the ASTRA desktop app through Native Messaging (localhost + token handshake).
- Content script reads visible interactive elements (role/text/aria/position) and performs actions ASTRA requests (navigate, find, click, type, extract, scroll, AI cursor).
- It never reads passwords fields' values beyond standard DOM visibility rules and never stores page data.
