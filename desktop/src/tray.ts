/**
 * ASTRA desktop — system tray.
 * Menu (per spec): Show ASTRA / Hide ASTRA / — / Enable Companion (checkbox) /
 * Enable AI Cursor (checkbox) / — / Settings… / Restart / Exit.
 * Left click on the tray icon opens the full app window.
 */
import { app, Menu, Tray, nativeImage } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadSettings, saveSettings } from './config'
import * as windows from './windows'
import type { NativeBridge } from './nativeBridge'

let tray: Tray | null = null

function resolveTrayIcon(): string {
  const candidates = [
    path.join(__dirname, 'tray.png'),
    path.join(__dirname, '..', '..', 'assets', 'icons', 'tray.png'),
    path.join(process.resourcesPath ?? '', 'ui', 'tray.png'),
  ]
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {
      // ignore inaccessible candidates
    }
  }
  return ''
}

export function createTray(bridge: NativeBridge): void {
  if (tray) return
  const iconPath = resolveTrayIcon()
  const icon = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('ASTRA — Astronaut AI Companion')

  const rebuildMenu = (): void => {
    if (!tray) return
    const settings = loadSettings()
    const companionVisible = windows.getCompanion()?.isVisible() ?? false
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show ASTRA',
        click: () => windows.showCompanion(),
      },
      {
        label: 'Hide ASTRA',
        click: () => windows.hideCompanion(),
      },
      { type: 'separator' },
      {
        label: 'Enable Companion',
        type: 'checkbox',
        checked: companionVisible,
        click: (item) => {
          if (item.checked) windows.showCompanion(false)
          else windows.hideCompanion()
        },
      },
      {
        label: 'Enable AI Cursor',
        type: 'checkbox',
        checked: settings.browser.aiCursor,
        click: (item) => {
          const next = saveSettings({ browser: { aiCursor: item.checked } })
          void bridge.request('set_cursor', { visible: next.browser.aiCursor }).catch(() => {})
          windows.broadcast('astra:settings:changed', next)
        },
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => windows.showApp(),
      },
      {
        label: 'Restart',
        click: () => {
          app.relaunch()
          app.exit(0)
        },
      },
      {
        label: 'Exit',
        click: () => app.quit(),
      },
    ])
    tray.setContextMenu(menu)
  }

  rebuildMenu()
  // Keep checkbox state honest when windows toggle outside the menu.
  setInterval(rebuildMenu, 1500)

  tray.on('click', () => {
    windows.showApp()
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
