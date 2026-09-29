import { contextBridge, ipcRenderer } from 'electron';

const INVOKE_CHANNELS = new Set([
  'state:get',
  'state:setMode',
  'chat:send',
  'chat:stop',
  'chat:history',
  'chat:clear',
  'voice:transcribe',
  'tts:speak',
  'settings:get',
  'settings:set',
  'credentials:set',
  'permissions:set',
  'ai:test',
  'browser:status',
  'browser:reregister',
  'research:save',
  'memory:get',
  'memory:clear',
  'app:openFull',
  'app:info',
  'app:restart',
  'app:quit',
  'window:minimize',
  'window:close',
  'companion:toggle',
  'open:external'
]);

contextBridge.exposeInMainWorld('astra', {
  invoke: (channel: string, payload?: unknown): Promise<unknown> => {
    if (!INVOKE_CHANNELS.has(channel)) {
      return Promise.resolve({ ok: false, error: 'Blocked IPC channel: ' + channel });
    }
    return ipcRenderer.invoke(channel, payload);
  },
  onEvent: (callback: (evt: unknown) => void): (() => void) => {
    const listener = (_ev: Electron.IpcRendererEvent, data: unknown): void => callback(data);
    ipcRenderer.on('astra:event', listener);
    return () => {
      ipcRenderer.removeListener('astra:event', listener);
    };
  }
});
