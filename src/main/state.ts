import { BrowserWindow } from 'electron';
import type { AstraState, AstraMode, AstraEvent } from '../shared/types';

let currentState: AstraState = 'IDLE';
let currentMode: AstraMode = 'COMPANION';
const activityFeed: AstraEvent[] = [];

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getState(): AstraState {
  return currentState;
}

export function getMode(): AstraMode {
  return currentMode;
}

export function setState(s: AstraState): void {
  currentState = s;
  emitEvent({ type: 'state', state: s });
}

export function setMode(m: AstraMode): void {
  currentMode = m;
  emitEvent({ type: 'mode', mode: m });
}

export function activity(label: string, detail?: string): void {
  emitEvent({ type: 'activity', id: newId(), ts: Date.now(), label, detail });
}

export function emitEvent(evt: AstraEvent): void {
  if (evt.type === 'activity') {
    activityFeed.unshift(evt);
    if (activityFeed.length > 80) activityFeed.pop();
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send('astra:event', evt);
      } catch {
        // window may be closing
      }
    }
  }
}

export function getFeed(): AstraEvent[] {
  return activityFeed.slice();
}
