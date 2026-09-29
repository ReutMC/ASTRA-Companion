#!/usr/bin/env node
/* ASTRA Native Messaging Host — stdio ⇄ WebSocket bridge (zero dependencies).
 *
 * Chrome spawns this process (via host.bat) and talks 4-byte LE length-prefixed
 * JSON on stdio. We bridge every frame 1:1 to the ASTRA desktop app over a
 * local WebSocket and back. This process is a dumb pipe: it never inspects,
 * transforms, or stores message contents.
 *
 * Requirements: Node.js ≥ 22 (global WebSocket). No npm dependencies.
 *
 * Lifecycle:
 *   1. Wait for %APPDATA%\ASTRA\native\port.json  ({ port, token }) — the
 *      desktop app writes it at startup. Retry every 1 s for up to 30 s.
 *   2. Connect to ws://127.0.0.1:<port>/?token=<token>
 *   3. Bridge until either side closes:
 *        stdin EOF / EPIPE          → exit(0)   (Chrome closed the port)
 *        WebSocket close / error    → exit(1)   (Chrome reports disconnect,
 *                                               the extension reconnects)
 *
 * Size limits (Chrome native messaging):
 *   • Chrome → host : ≤ 1 MB per message (screenshots are downscaled by the
 *                     extension's background worker to stay under this).
 *   • host → Chrome : practically large; we drop anything > 50 MB.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT_FILE_DIR_ARGS = ['ASTRA', 'native'];
const PORT_WAIT_MS = 30000;
const PORT_POLL_MS = 1000;
const MAX_MSG_FROM_APP_BYTES = 50 * 1024 * 1024;
const MAX_STDIN_BUFFER_BYTES = 64 * 1024 * 1024;

/* ── logging (stderr only — stdout is the protocol channel) ─────────────── */

function log() {
  const parts = Array.prototype.slice.call(arguments);
  try { process.stderr.write('[astra-host] ' + parts.join(' ') + '\n'); } catch (e) { /* ignore */ }
}

function fatal(message) {
  log('FATAL:', message);
  process.exit(1);
}

if (typeof WebSocket === 'undefined') {
  fatal('Node.js 22+ is required for the ASTRA native host (global WebSocket missing). ' +
    'Installed Node version: ' + process.version);
}

/* ── port.json discovery ────────────────────────────────────────────────── */

function portFilePath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join.apply(path, [appData].concat(PORT_FILE_DIR_ARGS).concat(['port.json']));
}

function readPortFile() {
  try {
    const raw = fs.readFileSync(portFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    const port = Number(parsed.port);
    const token = String(parsed.token || '');
    if (!Number.isInteger(port) || port <= 0 || port > 65535 || !token) return null;
    return { port: port, token: token };
  } catch (e) {
    return null;
  }
}

async function waitForPortFile() {
  const deadline = Date.now() + PORT_WAIT_MS;
  for (;;) {
    const info = readPortFile();
    if (info) return info;
    if (Date.now() >= deadline) {
      fatal('gave up waiting for ' + portFilePath() + ' after ' + (PORT_WAIT_MS / 1000) +
        's — is the ASTRA desktop app running?');
    }
    await new Promise(function (r) { setTimeout(r, PORT_POLL_MS); });
  }
}

/* ── Chrome native messaging (stdio) ────────────────────────────────────── */

let stdinBuffer = Buffer.alloc(0);
let ws = null;
const outboundQueue = []; // app-bound frames waiting for the WebSocket to open

function processStdinBuffer() {
  for (;;) {
    if (stdinBuffer.length < 4) return;
    const length = stdinBuffer.readUInt32LE(0);
    if (length === 0) {
      stdinBuffer = stdinBuffer.subarray(4);
      continue;
    }
    if (length > MAX_STDIN_BUFFER_BYTES) {
      log('frame from Chrome too large (' + length + ' bytes) — dropping buffer');
      stdinBuffer = Buffer.alloc(0);
      return;
    }
    if (stdinBuffer.length < 4 + length) return; // wait for the rest
    const payload = stdinBuffer.subarray(4, 4 + length);
    stdinBuffer = stdinBuffer.subarray(4 + length);
    let msg;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch (e) {
      log('invalid JSON from Chrome: ' + e.message);
      continue;
    }
    sendToApp(msg);
  }
}

function sendToApp(msg) {
  const text = JSON.stringify(msg);
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(text); } catch (e) { log('ws.send failed: ' + (e && e.message || e)); }
  } else {
    outboundQueue.push(text);
    if (outboundQueue.length > 256) outboundQueue.shift(); // safety valve
  }
}

function writeToChrome(msg) {
  let data;
  try { data = Buffer.from(JSON.stringify(msg), 'utf8'); } catch (e) {
    log('unserialisable message from app: ' + e.message);
    return;
  }
  if (data.length > MAX_MSG_FROM_APP_BYTES) {
    log('outgoing message too large (' + data.length + ' bytes) — dropped');
    return;
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(data.length, 0);
  try {
    process.stdout.write(Buffer.concat([header, data]));
  } catch (e) {
    // EPIPE — Chrome is gone; exit cleanly so nothing dangles.
    process.exit(0);
  }
}

function setupStdio() {
  process.stdin.on('data', function (chunk) {
    stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
    processStdinBuffer();
  });
  process.stdin.on('end', function () {
    log('stdin closed — Chrome disconnected the port. Exiting cleanly.');
    process.exit(0);
  });
  process.stdin.on('error', function (err) {
    log('stdin error: ' + (err && err.message || err));
    process.exit(0);
  });
  process.stdout.on('error', function (err) {
    log('stdout error: ' + (err && err.message || err));
    process.exit(0);
  });
  process.on('uncaughtException', function (err) {
    log('uncaught exception: ' + (err && err.stack || err));
    process.exit(1);
  });
  process.on('SIGTERM', function () { process.exit(0); });
  process.on('SIGINT', function () { process.exit(0); });
  if (process.stdin.setNoDelay) process.stdin.setNoDelay(true);
  process.stdin.resume();
}

/* ── WebSocket bridge ───────────────────────────────────────────────────── */

function connectToApp(info) {
  const url = 'ws://127.0.0.1:' + info.port + '/?token=' + encodeURIComponent(info.token);
  log('connecting to ASTRA app on 127.0.0.1:' + info.port + '…');

  ws = new WebSocket(url);

  ws.onopen = function () {
    log('connected to ASTRA app — native bridge is live');
    while (outboundQueue.length) {
      const text = outboundQueue.shift();
      try { ws.send(text); } catch (e) { log('queued send failed: ' + (e && e.message || e)); }
    }
  };

  ws.onmessage = function (event) {
    if (typeof event.data !== 'string') {
      log('ignoring non-text frame from app');
      return;
    }
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) {
      log('invalid JSON from app: ' + e.message);
      return;
    }
    writeToChrome(msg);
  };

  ws.onclose = function (event) {
    log('ASTRA app closed the connection (code ' + event.code + '). Exiting — ' +
      'Chrome will report a disconnect and the extension will reconnect.');
    process.exit(1);
  };

  ws.onerror = function (event) {
    const detail = (event && event.message) ? event.message : 'connection refused or token rejected';
    log('WebSocket error: ' + detail + ' — exiting.');
    process.exit(1);
  };
}

/* ── main ───────────────────────────────────────────────────────────────── */

async function main() {
  setupStdio();
  log('starting — pid', process.pid, 'node', process.version);
  const info = await waitForPortFile();
  connectToApp(info);
}

main();
