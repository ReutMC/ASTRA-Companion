import { globalShortcut } from 'electron';
import { store } from './store';
import { setState, setMode, getState, emitEvent } from './state';
import { showCompanion, toggleCompanionVisible } from './windows';

function normalizeAccelerator(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '+')
    .split('+')
    .filter(Boolean)
    .map((part) => {
      const p = part.toLowerCase();
      if (p === 'ctrl') return 'Control';
      if (p === 'option' || p === 'alt') return 'Alt';
      if (p === 'cmd' || p === 'command') return 'Super';
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join('+');
}

function wake(): void {
  if (!store.settings.companion.enabled) return;
  showCompanion();
  setMode('INTERACTION');
  setState('LISTENING');
  emitEvent({ type: 'wake', focus: true });
  setTimeout(() => {
    if (getState() === 'LISTENING') setState('IDLE');
  }, 9000);
}

export function registerShortcuts(): void {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
  if (store.settings.shortcuts.enabled === false) return;
  const key = normalizeAccelerator(store.settings.shortcuts.wake || 'Control+Space');
  try {
    globalShortcut.register(key, wake);
    globalShortcut.register('Control+Shift+A', () => toggleCompanionVisible());
  } catch {
    // shortcut already taken by another app - ignore
  }
}

export function unregisterShortcuts(): void {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }
}
