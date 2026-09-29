/**
 * ASTRA desktop — session permission policy & window hardening.
 * Deny everything except microphone (media), and only when the user has
 * MICROPHONE enabled in settings. Popups are denied; http(s) links open in
 * the user's default browser.
 */
import { session, shell } from 'electron'
import { loadSettings } from './config'

export function applyPermissionPolicies(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      callback(loadSettings().permissions.MICROPHONE)
      return
    }
    callback(false)
  })

  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'media') {
      return loadSettings().permissions.MICROPHONE
    }
    return false
  })
}

/** Attach to every window: block popups, open http(s) externally. */
export function applyWindowSecurity(win: import('electron').BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    // The renderer is a SPA; any in-window navigation attempt is bounced to
    // the default browser (http/s) or cancelled outright.
    if (url.startsWith('http://localhost:5173') || url.startsWith('file://')) {
      return
    }
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
  })
}
