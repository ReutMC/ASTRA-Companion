import type { PermissionKey } from '../shared/types';
import { store } from './store';

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  MICROPHONE: 'Microphone (voice input)',
  BROWSER: 'Browser control (Chrome via ASTRA extension)',
  FILES: 'Files (find, open, create in Documents/ASTRA)',
  WINDOWS_APPS: 'Windows apps (Chrome, VS Code, Notepad, Explorer)',
  NETWORK: 'Network (web search and page reading)',
  SCREEN_CAPTURE: 'Screen capture (currently unused)',
  CLIPBOARD: 'Clipboard write'
};

export function hasPermission(key: PermissionKey): boolean {
  return store.settings.permissions[key] === true;
}
