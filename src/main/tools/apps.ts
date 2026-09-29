import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import { clipboard } from 'electron';
import { toolRegistry } from './index';

function sanitizeArg(a: unknown): string {
  return String(a ?? '')
    .replace(/["`$&|<>^;*?~\\]/g, '')
    .trim()
    .slice(0, 300);
}

const APPS: Record<string, { win: string; mac: string; linux: string }> = {
  chrome: { win: 'chrome', mac: 'Google Chrome', linux: 'google-chrome' },
  vscode: { win: 'code', mac: 'Visual Studio Code', linux: 'code' },
  notepad: { win: 'notepad', mac: 'TextEdit', linux: 'gedit' },
  explorer: { win: 'explorer', mac: 'Finder', linux: 'xdg-open' }
};

function shellOpen(target: string): void {
  if (process.platform === 'win32') exec(`start "" "${target}"`, { windowsHide: true });
  else if (process.platform === 'darwin') exec(`open "${target}"`);
  else exec(`xdg-open "${target}"`);
}

function openApp(name: string, arg?: string): Promise<unknown> {
  const key = String(name || '').toLowerCase().trim();
  const def = APPS[key];
  if (!def) {
    return Promise.resolve({
      error: `"${name}" is not in the ASTRA app whitelist. Allowed: ${Object.keys(APPS).join(', ')}`
    });
  }
  const a = arg ? sanitizeArg(arg) : '';
  return new Promise((resolve) => {
    try {
      let done = false;
      const finish = (): void => {
        if (!done) {
          done = true;
          resolve({ ok: true, app: key });
        }
      };
      if (process.platform === 'win32') {
        exec(`start "" ${def.win}${a ? ` "${a}"` : ''}`, { windowsHide: true }, finish);
      } else if (process.platform === 'darwin') {
        exec(`open -a "${def.mac}"${a ? ` "${a}"` : ''}`, finish);
      } else {
        exec(`${def.linux}${a ? ` "${a}"` : ''}`, finish);
      }
      setTimeout(finish, 1500);
    } catch (e) {
      resolve({ error: String(e) });
    }
  });
}

export function registerAppTools(r: typeof toolRegistry): void {
  r.register({
    name: 'open_app',
    permission: 'WINDOWS_APPS',
    description: 'Open a whitelisted application: chrome, vscode, notepad or explorer. Optionally pass an argument such as a URL for chrome.',
    args: '{ "name": "chrome", "arg": "https://youtube.com (optional)" }',
    describe: (a) => `Opening ${String(a.name || 'app')}${a.arg ? ` (${String(a.arg).slice(0, 60)})` : ''}`,
    run: (a) => openApp(String(a.name || ''), a.arg ? String(a.arg) : undefined)
  });

  r.register({
    name: 'show_downloads',
    permission: 'WINDOWS_APPS',
    description: "Show the user's Downloads folder in the file explorer.",
    args: '{}',
    describe: () => 'Opening the Downloads folder',
    run: async () => {
      shellOpen(path.join(os.homedir(), 'Downloads'));
      return { ok: true };
    }
  });

  r.register({
    name: 'open_folder',
    permission: 'WINDOWS_APPS',
    description: 'Open a folder in the file explorer. Use an absolute path under the user profile, or special values: Downloads, Documents, ASTRA.',
    args: '{ "path": "Downloads | Documents | ASTRA | C:\\Users\\me\\..." }',
    describe: (a) => `Opening folder ${String(a.path || '')}`,
    run: async (a) => {
      const p = String(a.path || '').trim();
      const map: Record<string, string> = {
        Downloads: path.join(os.homedir(), 'Downloads'),
        Documents: path.join(os.homedir(), 'Documents'),
        ASTRA: path.join(os.homedir(), 'Documents', 'ASTRA')
      };
      const target = map[p.toLowerCase()] || map[p] || p;
      shellOpen(target);
      return { ok: true, path: target };
    }
  });

  r.register({
    name: 'clipboard_write',
    permission: 'CLIPBOARD',
    description: 'Copy text to the system clipboard.',
    args: '{ "text": "..." }',
    describe: (a) => `Copying ${String(a.text || '').length} characters to the clipboard`,
    run: async (a) => {
      clipboard.writeText(String(a.text ?? ''));
      return { ok: true };
    }
  });
}
