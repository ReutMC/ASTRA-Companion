import net from 'net';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { app } from 'electron';
import { store } from '../store';
import { emitEvent } from '../state';

interface BridgeMsg {
  id?: number;
  type?: string;
  ok?: boolean;
  data?: unknown;
  error?: string;
  event?: string;
  [k: string]: unknown;
}

let server: net.Server | null = null;
let client: net.Socket | null = null;
let token = '';
let seq = 1;
const pending = new Map<number, (m: BridgeMsg) => void>();

export function bridgeConnected(): boolean {
  return !!client;
}

function nativeHostDir(): string {
  return path.join(app.getPath('appData'), 'ASTRA', 'native-host');
}

function loadOrCreateToken(): string {
  const cfgPath = path.join(nativeHostDir(), 'native-host-config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg.token) return String(cfg.token);
  } catch {
    // create new
  }
  const t = crypto.randomBytes(24).toString('hex');
  try {
    fs.mkdirSync(nativeHostDir(), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify({ token: t }, null, 2));
  } catch {
    // ignore
  }
  return t;
}

function handleLine(sock: net.Socket, line: string): void {
  if (!line.trim()) return;
  let m: BridgeMsg;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.type === 'auth') {
    if (m.token === token) {
      client = sock;
      sock.write(JSON.stringify({ type: 'auth_ok' }) + '\n');
      emitEvent({ type: 'bridge', connected: true });
      emitEvent({ type: 'toast', message: 'Chrome connected to ASTRA.' });
    } else {
      sock.end();
    }
    return;
  }
  if (m.type === 'res' && typeof m.id === 'number' && pending.has(m.id)) {
    pending.get(m.id)!(m);
    pending.delete(m.id);
  }
}

export async function startBridge(): Promise<void> {
  const port = store.settings.browser.port || 39001;
  token = loadOrCreateToken();
  await stopBridge();
  await new Promise<void>((resolve) => {
    server = net.createServer((sock) => {
      let buf = '';
      sock.on('data', (d) => {
        buf += d.toString();
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          handleLine(sock, line);
        }
      });
      sock.on('error', () => {
        /* ignore */
      });
      sock.on('close', () => {
        if (sock === client) {
          client = null;
          emitEvent({ type: 'bridge', connected: false });
        }
      });
    });
    server.on('error', () => {
      server = null;
      resolve();
    });
    server.listen(port, '127.0.0.1', () => resolve());
  });
  writeNativeHostFiles(port, token);
}

export async function stopBridge(): Promise<void> {
  if (server) {
    try {
      server.close();
    } catch {
      // ignore
    }
  }
  server = null;
  client = null;
}

export async function restartBridge(): Promise<void> {
  await startBridge();
}

export function bridgeRequest<T = unknown>(action: string, payload: unknown, timeoutMs = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!client) {
      reject(new Error('Chrome connection unavailable.'));
      return;
    }
    const id = seq++;
    const sock = client;
    pending.set(id, (m) => {
      if (m.ok) resolve(m.data as T);
      else reject(new Error(String(m.error || 'Bridge error')));
    });
    try {
      sock.write(JSON.stringify({ id, type: 'req', action, payload }) + '\n');
    } catch (e) {
      pending.delete(id);
      reject(new Error('Chrome connection unavailable.'));
      return;
    }
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Chrome connection unavailable. (timed out - is ASTRA running in Chrome?)'));
      }
    }, timeoutMs);
  });
}

export function writeNativeHostFiles(port: number, t: string): void {
  const dir = nativeHostDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'native-host-config.json'), JSON.stringify({ port, token: t }, null, 2));

    const bat = path.join(dir, 'astra-host.bat');
    fs.writeFileSync(bat, `@echo off\r\n"${process.execPath}" --astra-native-host\r\n`, 'utf8');

    const extId = (store.settings.browser.extensionId || '').trim();
    const manifest = {
      name: 'com.astra.browser_bridge',
      description: 'ASTRA Browser Bridge',
      path: bat,
      type: 'stdio',
      allowed_origins: extId ? [`chrome-extension://${extId}/`] : []
    };
    fs.writeFileSync(path.join(dir, 'com.astra.browser_bridge.json'), JSON.stringify(manifest, null, 2));
  } catch {
    // ignore
  }
}

export async function registerNmh(): Promise<void> {
  const dir = nativeHostDir();
  const port = store.settings.browser.port || 39001;
  token = loadOrCreateToken();
  writeNativeHostFiles(port, token);
  const manifestPath = path.join(dir, 'com.astra.browser_bridge.json');

  if (process.platform === 'win32') {
    const keys = [
      'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.astra.browser_bridge',
      'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.astra.browser_bridge'
    ];
    for (const k of keys) {
      execFile('reg', ['add', k, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], () => {
        /* best effort */
      });
    }
  } else {
    const home = app.getPath('home');
    const dirs: string[] = [];
    if (process.platform === 'darwin') {
      dirs.push(
        path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
        path.join(home, 'Library', 'Application Support', 'Microsoft Edge', 'NativeMessagingHosts')
      );
    } else {
      dirs.push(
        path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts'),
        path.join(home, '.config', 'microsoft-edge', 'NativeMessagingHosts')
      );
    }
    try {
      const manifest = fs.readFileSync(manifestPath, 'utf8');
      for (const d of dirs) {
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'com.astra.browser_bridge.json'), manifest);
      }
    } catch {
      // ignore
    }
  }
}
