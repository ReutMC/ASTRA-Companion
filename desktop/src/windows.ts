/**
 * ASTRA desktop — window management.
 * Two frameless windows share one preload:
 *   - Companion: transparent, always-on-top, optionally click-through orb.
 *   - App: full control-panel window with a custom (renderer-drawn) titlebar.
 */
import { app, BrowserWindow, screen } from 'electron'
import * as path from 'node:path'
import {
  loadCompanionBounds,
  loadSettings,
  saveCompanionBounds,
} from './config'
import type { Mode, Settings } from './types'
import { applyWindowSecurity } from './permissions'

let companion: BrowserWindow | null = null
let appWindow: BrowserWindow | null = null
let activeMode: Mode = 'companion'
let hoverInteractive = false
let quitting = false
let boundsTimer: NodeJS.Timeout | null = null

const isDev = process.env.ASTRA_DEV ? process.env.ASTRA_DEV === '1' : !app.isPackaged

function preloadPath(): string {
  return path.join(__dirname, 'preload.js')
}

function rendererTarget(mode: Mode): { url?: string; file?: string; query: Record<string, string> } {
  const query = { mode }
  if (isDev) {
    return { url: `http://localhost:5173?mode=${mode}`, query }
  }
  const uiIndex = app.isPackaged
    ? path.join(process.resourcesPath, 'ui', 'index.html')
    : path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html')
  return { file: uiIndex, query }
}

async function loadInto(win: BrowserWindow, mode: Mode): Promise<void> {
  const target = rendererTarget(mode)
  try {
    if (target.url) {
      await win.loadURL(target.url)
    } else if (target.file) {
      await win.loadFile(target.file, { query: target.query })
    }
  } catch (err) {
    console.error(`[astra] failed to load renderer (${mode}):`, err)
  }
}

function defaultCompanionPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  const width = 380
  const height = 520
  return {
    x: workArea.x + workArea.width - width - 28,
    y: workArea.y + workArea.height - height - 28,
  }
}

function boundsAreVisible(bounds: { x?: number; y?: number; width: number; height: number }): boolean {
  if (bounds.x === undefined || bounds.y === undefined) return false
  return screen.getAllDisplays().some((display) => {
    const { workArea } = display
    return (
      bounds.x! >= workArea.x - bounds.width + 80 &&
      bounds.x! < workArea.x + workArea.width - 80 &&
      bounds.y! >= workArea.y - 20 &&
      bounds.y! < workArea.y + workArea.height - 80
    )
  })
}

function scheduleBoundsPersist(): void {
  if (boundsTimer) clearTimeout(boundsTimer)
  boundsTimer = setTimeout(() => {
    boundsTimer = null
    if (!companion || companion.isDestroyed()) return
    const { x, y, width, height } = companion.getBounds()
    saveCompanionBounds({ x, y, width, height })
  }, 400)
}

function updateIgnoreMouse(): void {
  if (!companion || companion.isDestroyed()) return
  const settings = loadSettings()
  const ignore = settings.companion.clickThrough || !hoverInteractive
  // forward:true keeps mouse-move events flowing to the renderer even while
  // ignored, so the renderer can re-enable interaction over panels.
  companion.setIgnoreMouseEvents(ignore, { forward: true })
}

export function createCompanionWindow(): BrowserWindow {
  if (companion && !companion.isDestroyed()) return companion
  const settings = loadSettings()
  const bounds = loadCompanionBounds()
  const fallback = defaultCompanionPosition()
  const useBounds = bounds && boundsAreVisible(bounds) ? bounds : null

  companion = new BrowserWindow({
    width: useBounds?.width ?? 380,
    height: useBounds?.height ?? 520,
    x: useBounds?.x ?? fallback.x,
    y: useBounds?.y ?? fallback.y,
    minWidth: 280,
    minHeight: 340,
    transparent: true,
    frame: false,
    fullscreenable: false,
    resizable: true,
    alwaysOnTop: settings.companion.alwaysOnTop,
    skipTaskbar: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  applyWindowSecurity(companion)
  if (settings.companion.alwaysOnTop) {
    companion.setAlwaysOnTop(true, 'screen-saver')
  }
  companion.setOpacity(settings.companion.opacity)
  updateIgnoreMouse()

  companion.on('moved', scheduleBoundsPersist)
  companion.on('resized', scheduleBoundsPersist)
  companion.on('close', (event) => {
    scheduleBoundsPersist()
    if (!quitting) {
      event.preventDefault()
      companion?.hide()
    }
  })
  companion.on('closed', () => {
    companion = null
  })

  void loadInto(companion, 'companion')
  return companion
}

export function createAppWindow(): BrowserWindow {
  if (appWindow && !appWindow.isDestroyed()) return appWindow

  appWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    titleBarStyle: 'default',
    backgroundColor: '#050A14',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  applyWindowSecurity(appWindow)
  appWindow.once('ready-to-show', () => appWindow?.show())
  appWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      appWindow?.hide()
    }
  })
  appWindow.on('closed', () => {
    appWindow = null
  })

  void loadInto(appWindow, 'app')
  return appWindow
}

export function createWindows(): void {
  createCompanionWindow()
  createAppWindow()
}

export function getCompanion(): BrowserWindow | null {
  return companion && !companion.isDestroyed() ? companion : null
}

export function getAppWindow(): BrowserWindow | null {
  return appWindow && !appWindow.isDestroyed() ? appWindow : null
}

export function getAllWindows(): BrowserWindow[] {
  return [companion, appWindow].filter(
    (win): win is BrowserWindow => win !== null && !win.isDestroyed(),
  )
}

/** Mode switch: companion mode hides the app window; app mode keeps the companion visible. */
export function showWindow(mode: Mode): void {
  activeMode = mode
  if (mode === 'companion') {
    appWindow?.hide()
    const win = createCompanionWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    const win = createAppWindow()
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    getCompanion()?.showInactive()
  }
  broadcast('astra:companion:mode', { mode: activeMode })
}

/** Show only the companion window (used by tray / global shortcut wake). */
export function showCompanion(focus = true): void {
  const win = createCompanionWindow()
  if (win.isMinimized()) win.restore()
  if (focus) {
    win.show()
    win.focus()
  } else {
    win.showInactive()
  }
}

/** Show only the full app window; the companion stays as-is. */
export function showApp(): void {
  const win = createAppWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function hideCompanion(): void {
  companion?.hide()
}

export function getActiveMode(): Mode {
  return activeMode
}

/** Window control ops requested by the custom renderer titlebar. */
export function windowOp(op: string): void {
  const win = appWindow && !appWindow.isDestroyed() ? appWindow : null
  if (!win) return
  switch (op) {
    case 'minimize':
      win.minimize()
      break
    case 'maximize':
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      break
    case 'close':
    case 'hide':
    default:
      win.hide()
      break
  }
}

/** Apply companion-related settings to the live window. */
export function applyCompanionSettings(settings: Settings): void {
  const win = getCompanion()
  if (!win) return
  if (settings.companion.alwaysOnTop) {
    win.setAlwaysOnTop(true, 'screen-saver')
  } else {
    win.setAlwaysOnTop(false)
  }
  win.setOpacity(Math.min(1, Math.max(0.2, settings.companion.opacity)))
  updateIgnoreMouse()
}

/** Renderer reports whether the pointer is over interactive UI (click-through). */
export function setCompanionHoverInteractive(interactive: boolean): void {
  if (hoverInteractive === interactive) return
  hoverInteractive = interactive
  updateIgnoreMouse()
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

export function sendToCompanion(channel: string, payload: unknown): void {
  const win = getCompanion()
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload)
  }
}

/** Must be called before app.quit() so window close handlers allow exit. */
export function markQuitting(): void {
  quitting = true
}
