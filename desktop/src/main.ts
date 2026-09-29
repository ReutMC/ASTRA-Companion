/**
 * ASTRA desktop — application entry point.
 * Single-instance tray application hosting the companion + app windows, the
 * Chrome native bridge, global shortcuts and the agent runtime IPC.
 */
import { app } from 'electron'
import * as windows from './windows'
import { createTray, destroyTray } from './tray'
import { registerShortcuts, unregisterAllShortcuts } from './shortcuts'
import { NativeBridge } from './nativeBridge'
import { applyPermissionPolicies } from './permissions'
import { registerIpc } from './ipc'
import { loadSettings, resetSettingsCache } from './config'

let bridge: NativeBridge | null = null
let shortcutsHandle: ReturnType<typeof registerShortcuts> | null = null

// Single instance — focus the app window instead of spawning a second copy.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    windows.showApp()
  })

  app.whenReady().then(() => {
    const settings = loadSettings()
    const startHidden = process.argv.includes('--hidden')

    applyPermissionPolicies()
    windows.createWindows()

    bridge = new NativeBridge()
    void bridge.start((connected) => {
      windows.broadcast('astra:browser:status', { connected })
    })

    shortcutsHandle = registerShortcuts(settings, onShortcutActivate)
    registerIpc({ bridge, shortcuts: shortcutsHandle })
    createTray(bridge)

    if (!startHidden) {
      windows.showCompanion(false)
    }
  })

  // Tray application: keep running when all windows are closed/hidden.
  app.on('window-all-closed', () => {
    // no-op — ASTRA lives in the tray until the user exits explicitly.
  })

  app.on('activate', () => {
    if (app.isReady()) windows.showCompanion(false)
  })

  app.on('before-quit', () => {
    windows.markQuitting()
    unregisterAllShortcuts()
    shortcutsHandle?.unregister()
    bridge?.close()
    destroyTray()
    resetSettingsCache()
  })
}

function onShortcutActivate(): void {
  windows.showCompanion(true)
  windows.sendToCompanion('astra:companion:wake', { at: Date.now() })
}
