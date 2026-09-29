import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { store } from './store';
import { emitEvent, getMode } from './state';

let companion: BrowserWindow | null = null;
let full: BrowserWindow | null = null;
let hoverTimer: ReturnType<typeof setInterval> | null = null;

export function companionWindow(): BrowserWindow | null {
  return companion && !companion.isDestroyed() ? companion : null;
}

export function fullWindow(): BrowserWindow | null {
  return full && !full.isDestroyed() ? full : null;
}

function preloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'preload.js');
}

function renderer(p: string): string {
  return path.join(__dirname, '..', '..', 'src', 'renderer', p);
}

function boundsFile(): string {
  return path.join(app.getPath('userData'), 'companion-bounds.json');
}

function loadBounds(): Electron.Rectangle | null {
  try {
    const b = JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
    // Clamp into a visible display (multi-monitor safe)
    const displays = screen.getAllDisplays();
    const ok = displays.some(
      (d) =>
        b.x >= d.workArea.x - 40 &&
        b.y >= d.workArea.y - 40 &&
        b.x < d.workArea.x + d.workArea.width &&
        b.y < d.workArea.y + d.workArea.height
    );
    return ok ? b : null;
  } catch {
    return null;
  }
}

export function createCompanion(): void {
  const bounds = loadBounds();
  companion = new BrowserWindow({
    width: bounds?.width ?? 340,
    height: bounds?.height ?? 470,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 260,
    minHeight: 360,
    maxWidth: 520,
    maxHeight: 780,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    fullscreenable: false,
    maximizable: false,
    skipTaskbar: true,
    show: !process.argv.includes('--hidden'),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  companion.setAlwaysOnTop(Boolean(store.settings.appearance.alwaysOnTop), 'screen-saver');
  try {
    companion.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch {
    // not supported on all platforms
  }
  companion.setOpacity(store.settings.appearance.opacity ?? 1);
  companion.loadFile(renderer('companion/index.html'));

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveBounds = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (companion && !companion.isDestroyed()) {
        try {
          fs.writeFileSync(boundsFile(), JSON.stringify(companion.getBounds()));
        } catch {
          // ignore
        }
      }
    }, 500);
  };
  companion.on('move', saveBounds);
  companion.on('resize', saveBounds);
  companion.on('closed', () => {
    companion = null;
  });
  companion.webContents.on('did-finish-load', () => {
    emitEvent({ type: 'mode', mode: getMode() });
  });
  applyAppearance();
  applyClickThrough();
}

export function applyAppearance(): void {
  const c = companionWindow();
  if (!c) return;
  c.setOpacity(store.settings.appearance.opacity ?? 1);
  try {
    c.webContents.setZoomFactor(store.settings.appearance.size ?? 1);
  } catch {
    // ignore
  }
  try {
    c.setAlwaysOnTop(Boolean(store.settings.appearance.alwaysOnTop), 'screen-saver');
  } catch {
    // ignore
  }
}

export function applyClickThrough(): void {
  const enabled = store.settings.appearance.clickThrough === true;
  if (hoverTimer) {
    clearInterval(hoverTimer);
    hoverTimer = null;
  }
  const c = companionWindow();
  if (!c) return;
  if (!enabled) {
    c.setIgnoreMouseEvents(false);
    return;
  }
  hoverTimer = setInterval(() => {
    const w = companionWindow();
    if (!w) return;
    const p = screen.getCursorScreenPoint();
    const b = w.getBounds();
    const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
    w.setIgnoreMouseEvents(!inside, { forward: true });
  }, 250);
}

export function showCompanion(): void {
  if (!companion) createCompanion();
  const c = companionWindow();
  if (!c) return;
  if (c.isMinimized()) c.restore();
  c.show();
  c.focus();
}

export function toggleCompanionVisible(): void {
  const c = companionWindow();
  if (!c) {
    showCompanion();
    return;
  }
  if (c.isVisible()) c.hide();
  else showCompanion();
}

export function openFull(view: string = 'chat'): void {
  if (!full) {
    full = new BrowserWindow({
      width: 1120,
      height: 720,
      minWidth: 920,
      minHeight: 600,
      frame: false,
      backgroundColor: '#070b16',
      show: false,
      title: 'ASTRA Console',
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    full.loadFile(renderer('app/index.html'));
    full.on('closed', () => {
      full = null;
    });
    full.once('ready-to-show', () => {
      full?.show();
      full?.focus();
    });
  } else {
    full.show();
    full.focus();
  }
  const target = full;
  const sendView = (): void => {
    try {
      target?.webContents.send('astra:event', { type: 'view', view });
    } catch {
      // ignore
    }
  };
  if (target.webContents.isLoading()) {
    target.webContents.once('did-finish-load', sendView);
  } else {
    sendView();
  }
  emitEvent({ type: 'mode', mode: 'FULL_WINDOW' });
}
