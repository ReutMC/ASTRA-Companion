/**
 * ASTRA desktop — preload.
 * Exposes the minimal, promise-based `window.astra` API defined in
 * CONTRACTS §9. No Node primitives leak into the renderer; every
 * subscription helper returns a cleanup function.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { AgentEvent, Settings } from './types'

type Mode = 'companion' | 'app'
type WindowOp = 'minimize' | 'maximize' | 'close' | 'hide'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  // agent
  submit: (text: string): Promise<unknown> => ipcRenderer.invoke('astra:agent:submit', { text }),
  cancel: (): Promise<unknown> => ipcRenderer.invoke('astra:agent:cancel'),
  resolveApproval: (id: string, approved: boolean): Promise<unknown> =>
    ipcRenderer.invoke('astra:approval:resolve', { id, approved }),

  // settings & permissions
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('astra:settings:get'),
  setSettings: (patch: unknown): Promise<Settings> => ipcRenderer.invoke('astra:settings:set', patch),
  setPermissions: (patch: unknown): Promise<Settings> =>
    ipcRenderer.invoke('astra:permissions:set', patch),

  // memory
  clearMemory: (): Promise<unknown> => ipcRenderer.invoke('astra:memory:clear'),
  exportMemory: (): Promise<{ path: string; exists: boolean; content: string }> =>
    ipcRenderer.invoke('astra:memory:export'),

  // companion window
  setCompanion: (patch: unknown): Promise<Settings> => ipcRenderer.invoke('astra:companion:set', patch),
  setMode: (mode: Mode): Promise<unknown> => ipcRenderer.invoke('astra:companion:mode', { mode }),
  hoverInteractive: (interactive: boolean): void => {
    ipcRenderer.send('astra:companion:hoverInteractive', interactive)
  },

  // browser bridge & shell
  browserStatus: (): Promise<{ connected: boolean }> => ipcRenderer.invoke('astra:browser:status'),
  openExternal: (url: string): Promise<unknown> => ipcRenderer.invoke('astra:shell:openExternal', { url }),

  // window controls & voice
  windowOp: (op: WindowOp): Promise<unknown> => ipcRenderer.invoke('astra:window', { op }),
  // TTS runs renderer-side (frontend/src/voice/tts.ts); the method is kept
  // for API parity with CONTRACTS §9 but resolves locally by design.
  speak: (_text: string): Promise<void> => Promise.resolve(),
  whisper: (base64: string): Promise<{ text: string }> =>
    ipcRenderer.invoke('astra:stt:whisper', { base64 }),

  // subscriptions
  onAgentEvent: (cb: (event: AgentEvent) => void): (() => void) =>
    subscribe<AgentEvent>('astra:agent:event', cb),
  onSettingsChanged: (cb: (settings: Settings) => void): (() => void) =>
    subscribe<Settings>('astra:settings:changed', cb),
  onBrowserStatus: (cb: (status: { connected: boolean }) => void): (() => void) =>
    subscribe<{ connected: boolean }>('astra:browser:status', cb),
  onMode: (cb: (mode: Mode) => void): (() => void) => subscribe<Mode>('astra:companion:mode', cb),
  onWake: (cb: () => void): (() => void) =>
    subscribe<{ at: number }>('astra:companion:wake', () => cb()),
}

export type AstraPreloadApi = typeof api

contextBridge.exposeInMainWorld('astra', api)
