// ASTRA Native Messaging host.
// Launched by Chrome via the registered manifest (astra-host.bat -> "<exe>" --astra-native-host).
// Bridges Chrome's length-prefixed stdio protocol to ASTRA's localhost TCP bridge.

import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';

function appDataDir(): string {
  const home = os.homedir();
  if (process.platform === 'win32') return process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

function writeFrame(b: Buffer): void {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(b.length, 0);
  process.stdout.write(Buffer.concat([len, b]));
}

export function runNativeHost(): void {
  const cfgPath = path.join(appDataDir(), 'ASTRA', 'native-host', 'native-host-config.json');
  let cfg: { port?: number; token?: string };
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    process.exit(1);
  }
  if (!cfg.port || !cfg.token) process.exit(1);

  const sock = net.connect(cfg.port, '127.0.0.1');
  const send = (o: unknown): void => {
    try {
      sock.write(JSON.stringify(o) + '\n');
    } catch {
      // ignore
    }
  };

  sock.on('connect', () => send({ type: 'auth', token: cfg.token }));

  let buf = '';
  sock.on('data', (d) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) writeFrame(Buffer.from(line, 'utf8'));
    }
  });
  sock.on('error', () => process.exit(1));
  sock.on('close', () => process.exit(0));

  let sbuf = Buffer.alloc(0);
  let expectingLen = 0;

  process.stdin.on('data', (chunk: Buffer) => {
    sbuf = Buffer.concat([sbuf, chunk]);
    for (;;) {
      if (!expectingLen) {
        if (sbuf.length < 4) return;
        expectingLen = sbuf.readUInt32LE(0);
        sbuf = sbuf.slice(4);
      }
      if (sbuf.length < expectingLen) return;
      const msg = sbuf.slice(0, expectingLen);
      sbuf = sbuf.slice(expectingLen);
      expectingLen = 0;
      try {
        send(JSON.parse(msg.toString('utf8')));
      } catch {
        // ignore malformed frames
      }
    }
  });

  process.stdin.on('end', () => process.exit(0));
  process.stdin.resume();
}
