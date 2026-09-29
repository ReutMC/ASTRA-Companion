import { ipcMain, app, shell } from 'electron';
import { store } from './store';
import { getState, getMode, setState, setMode, getFeed, activity, emitEvent } from './state';
import { registerShortcuts } from './shortcuts';
import {
  companionWindow,
  fullWindow,
  openFull,
  toggleCompanionVisible,
  applyClickThrough,
  applyAppearance,
  showCompanion
} from './windows';
import { runAgent, agentAbort, isBusy } from './agent/agent';
import { transcribeAudio, speakText, aiTest } from './providers/ai';
import { bridgeConnected, restartBridge, registerNmh } from './browser/bridge';
import { saveResearchFile } from './tools/files';
import { hasPermission } from './permissions';

const PERMISSION_KEYS = ['MICROPHONE', 'BROWSER', 'FILES', 'WINDOWS_APPS', 'NETWORK', 'SCREEN_CAPTURE', 'CLIPBOARD'];

export function registerIpc(): void {
  ipcMain.handle('state:get', () => ({ state: getState(), mode: getMode(), busy: isBusy(), activity: getFeed() }));

  ipcMain.handle('state:setMode', (_e, p) => {
    const m = String(p?.mode || 'COMPANION');
    if (m === 'RESEARCH' || m === 'FULL_WINDOW') {
      openFull(m === 'RESEARCH' ? 'research' : 'chat');
      setMode(m);
    } else {
      setMode(m === 'INTERACTION' ? 'INTERACTION' : 'COMPANION');
      showCompanion();
      if (m === 'INTERACTION') emitEvent({ type: 'wake', focus: true });
    }
    return { ok: true };
  });

  ipcMain.handle('chat:send', (_e, p) => {
    const text = String(p?.text || '').trim();
    if (!text) return { ok: false, error: 'Empty message.' };
    if (isBusy()) return { ok: false, error: 'ASTRA is still working on the previous task.' };
    emitEvent({ type: 'chat:user', text });
    runAgent(text).catch((err) => {
      emitEvent({ type: 'error', message: String((err as Error)?.message || err) });
      setState('ERROR');
      setTimeout(() => {
        if (getState() === 'ERROR') setState('IDLE');
      }, 2600);
    });
    return { ok: true };
  });

  ipcMain.handle('chat:stop', () => {
    agentAbort();
    return { ok: true };
  });

  ipcMain.handle('chat:history', () => store.recentHistory(40));

  ipcMain.handle('chat:clear', () => {
    store.clearHistory();
    emitEvent({ type: 'chat:cleared' });
    return { ok: true };
  });

  ipcMain.handle('voice:transcribe', async (_e, p) => {
    if (!hasPermission('MICROPHONE')) return { ok: false, error: 'Microphone permission is disabled (Settings > Permissions).' };
    try {
      const text = await transcribeAudio(String(p?.dataB64 || ''), String(p?.mime || 'audio/webm'));
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message || err) };
    }
  });

  ipcMain.handle('tts:speak', async (_e, p) => {
    try {
      const b = await speakText(String(p?.text || '').slice(0, 3000));
      if (b) return { ok: true, audioB64: 'data:audio/mpeg;base64,' + b };
    } catch {
      // fall through to system TTS
    }
    return { ok: false, fallback: true };
  });

  ipcMain.handle('settings:get', () => ({
    settings: store.settings,
    hasApiKey: store.hasCred('aiApiKey'),
    activity: getFeed()
  }));

  ipcMain.handle('settings:set', (_e, p) => {
    store.patchSettings(p);
    applyAppearance();
    applyClickThrough();
    registerShortcuts();
    try {
      app.setLoginItemSettings({ openAtLogin: store.settings.general.startWithWindows === true });
    } catch {
      // ignore
    }
    const patchObj = (p || {}) as Record<string, unknown>;
    if (patchObj.browser) {
      restartBridge().catch(() => {
        /* ignore */
      });
      if (patchObj.browser && typeof patchObj.browser === 'object') {
        registerNmh().catch(() => {
          /* ignore */
        });
      }
    }
    emitEvent({ type: 'settings-changed', settings: store.settings });
    return { ok: true, settings: store.settings };
  });

  ipcMain.handle('credentials:set', (_e, p) => {
    store.setCred(String(p?.key || ''), String(p?.value || ''));
    return { ok: true };
  });

  ipcMain.handle('permissions:set', (_e, p) => {
    const k = String(p?.key || '');
    if (!PERMISSION_KEYS.includes(k)) return { ok: false, error: 'Unknown permission.' };
    store.patchSettings({ permissions: { [k]: p?.value === true } } as unknown as Record<string, never>);
    emitEvent({ type: 'settings-changed', settings: store.settings });
    return { ok: true, permissions: store.settings.permissions };
  });

  ipcMain.handle('ai:test', async () => {
    try {
      const t = await aiTest();
      return { ok: true, message: t };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message || err) };
    }
  });

  ipcMain.handle('browser:status', () => ({
    connected: bridgeConnected(),
    port: store.settings.browser.port,
    extensionId: store.settings.browser.extensionId
  }));

  ipcMain.handle('browser:reregister', async () => {
    try {
      await registerNmh();
      await restartBridge();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message || err) };
    }
  });

  ipcMain.handle('research:save', async (_e, p) => {
    try {
      const r = await saveResearchFile(String(p?.title || 'ASTRA Report'), String(p?.markdown || ''));
      activity('Report saved to Documents/ASTRA/Research.');
      return r;
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message || err) };
    }
  });

  ipcMain.handle('memory:get', () => store.memory);

  ipcMain.handle('memory:clear', () => {
    store.clearMemory();
    return { ok: true };
  });

  ipcMain.handle('app:openFull', (_e, p) => {
    openFull(String(p?.view || 'chat'));
    return { ok: true };
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform
  }));

  ipcMain.handle('app:restart', () => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle('app:quit', () => {
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle('window:minimize', () => {
    fullWindow()?.minimize();
    return { ok: true };
  });

  ipcMain.handle('window:close', () => {
    fullWindow()?.hide();
    return { ok: true };
  });

  ipcMain.handle('companion:toggle', () => {
    toggleCompanionVisible();
    return { ok: true };
  });

  ipcMain.handle('open:external', (_e, p) => {
    const u = String(p?.url || '');
    if (/^https?:\/\//i.test(u)) shell.openExternal(u);
    return { ok: true };
  });

  // keep references used indirectly
  void companionWindow;
}
