import { Tray, Menu, app, nativeImage } from 'electron';
import path from 'path';
import { store } from './store';
import { openFull, toggleCompanionVisible } from './windows';
import { emitEvent } from './state';

let tray: Tray | null = null;

export function createTray(): void {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  let img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) img = img.resize({ width: 24, height: 24 });

  tray = new Tray(img);
  tray.setToolTip('ASTRA - Astronaut AI Companion');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show / Hide ASTRA', click: () => toggleCompanionVisible() },
      { label: 'Open Console', click: () => openFull('chat') },
      { type: 'separator' },
      {
        label: 'Enable / Disable AI Cursor',
        click: () => {
          store.patchSettings({ browser: { aiCursor: !store.settings.browser.aiCursor } });
          emitEvent({ type: 'toast', message: `AI Cursor ${store.settings.browser.aiCursor ? 'enabled' : 'disabled'}` });
        }
      },
      {
        label: 'Enable / Disable Companion Mode',
        click: () => {
          store.patchSettings({ companion: { enabled: !store.settings.companion.enabled } });
          emitEvent({ type: 'toast', message: `Companion ${store.settings.companion.enabled ? 'enabled' : 'disabled'}` });
        }
      },
      { type: 'separator' },
      { label: 'Settings...', click: () => openFull('settings') },
      {
        label: 'Restart ASTRA',
        click: () => {
          app.relaunch();
          app.exit(0);
        }
      },
      { type: 'separator' },
      { label: 'Exit', click: () => app.exit(0) }
    ])
  );
}
