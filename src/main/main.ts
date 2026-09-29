import { app, session, powerMonitor } from 'electron';
import path from 'path';
import { store } from './store';
import { setState, emitEvent } from './state';
import { createCompanion, showCompanion, applyClickThrough, applyAppearance } from './windows';
import { createTray } from './tray';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { registerIpc } from './ipc';
import { startBridge, stopBridge, registerNmh } from './browser/bridge';
import { runNativeHost } from './nativehost';

const HOST_FLAG = '--astra-native-host';

if (process.argv.includes(HOST_FLAG)) {
  // Running as the Chrome Native Messaging host (stdio bridge). Never boots the UI.
  runNativeHost();
} else {
  bootstrap();
}

function bootstrap(): void {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => showCompanion());
  app.whenReady().then(onReady).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('ASTRA failed to start:', e);
  });

  app.on('window-all-closed', () => {
    // Keep running in the tray.
  });

  app.on('before-quit', () => {
    unregisterShortcuts();
    stopBridge();
  });
}

function onReady(): void {
  store.init();
  applyClickThrough();

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') {
      callback(store.settings.permissions.MICROPHONE === true);
    } else if (permission === 'clipboard-sanitized-write') {
      callback(store.settings.permissions.CLIPBOARD !== false);
    } else {
      callback(true);
    }
  });

  createCompanion();
  createTray();
  registerIpc();

  startBridge().catch((e) => {
    emitEvent({ type: 'error', message: 'Browser bridge failed to start: ' + String((e as Error).message || e) });
  });

  if (store.settings.browser.registerNativeHost !== false) {
    registerNmh().catch(() => {
      // best effort; user can re-register from Settings -> Browser
    });
  }

  registerShortcuts();
  setState('IDLE');

  powerMonitor.on('suspend', () => setState('SLEEPING'));
  powerMonitor.on('lock-screen', () => setState('SLEEPING'));
  powerMonitor.on('resume', () => setState('IDLE'));
  powerMonitor.on('unlock-screen', () => setState('IDLE'));

  try {
    app.setLoginItemSettings({
      openAtLogin: store.settings.general.startWithWindows === true,
      path: app.getPath('exe'),
      args: ['--hidden']
    });
  } catch {
    // ignore
  }

  applyAppearance();
}
