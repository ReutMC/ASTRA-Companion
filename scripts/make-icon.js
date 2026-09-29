#!/usr/bin/env node
// Generates ASTRA icon assets (no external dependencies):
//   assets/icon.png               512x512 app icon
//   build/icon.ico                multi-size Windows icon (16..256, PNG-compressed entries)
//   browser-extension/icon.png    128x128 extension icon

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- PNG encoding ----------
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcB]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- tiny rasterizer ----------
function canvas(s) {
  return { s, d: Buffer.alloc(s * s * 4) };
}

function px(c, x, y, col) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.s || y >= c.s) return;
  const i = (y * c.s + x) * 4;
  const a = col[3] / 255;
  const d = c.d;
  const ba = d[i + 3] / 255;
  const na = a + ba * (1 - a);
  if (na <= 0) return;
  d[i] = (col[0] * a + d[i] * ba * (1 - a)) / na;
  d[i + 1] = (col[1] * a + d[i + 1] * ba * (1 - a)) / na;
  d[i + 2] = (col[2] * a + d[i + 2] * ba * (1 - a)) / na;
  d[i + 3] = na * 255;
}

function circle(c, cx, cy, r, col, soft) {
  soft = soft == null ? Math.max(1, c.s / 256) : soft;
  for (let y = Math.floor(cy - r - soft - 2); y <= Math.ceil(cy + r + soft + 2); y++) {
    for (let x = Math.floor(cx - r - soft - 2); x <= Math.ceil(cx + r + soft + 2); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.max(0, Math.min(1, (r - d) / soft));
      if (a > 0) px(c, x, y, [col[0], col[1], col[2], col[3] * a]);
    }
  }
}

function rrect(c, x0, y0, w, h, r, col) {
  const left = x0, top = y0, right = x0 + w - 1, bottom = y0 + h - 1;
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y++) {
    for (let x = Math.floor(left); x <= Math.ceil(right); x++) {
      const qx = Math.max(left + r - x, x - (right - r), 0);
      const qy = Math.max(top + r - y, y - (bottom - r), 0);
      const d = Math.hypot(qx, qy);
      if (d <= r + 0.5) px(c, x, y, col);
    }
  }
}

function ring(c, cx, cy, r, w, col) {
  for (let y = Math.floor(cy - r - w); y <= Math.ceil(cy + r + w); y++) {
    for (let x = Math.floor(cx - r - w); x <= Math.ceil(cx + r + w); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r - w / 2 && d <= r + w / 2) {
        const edge = Math.min(1, r + w / 2 - d + 0.5, d - (r - w / 2) + 0.5);
        px(c, x, y, [col[0], col[1], col[2], col[3] * Math.max(0, edge)]);
      }
    }
  }
}

function vgrad(c, top, bottom) {
  for (let y = 0; y < c.s; y++) {
    const t = y / (c.s - 1);
    const col = [
      top[0] + (bottom[0] - top[0]) * t,
      top[1] + (bottom[1] - top[1]) * t,
      top[2] + (bottom[2] - top[2]) * t,
      top[3] + (bottom[3] - top[3]) * t
    ];
    for (let x = 0; x < c.s; x++) {
      const i = (y * c.s + x) * 4;
      if (c.d[i + 3] > 0) px(c, x, y, col);
    }
  }
}

// ---------- icon design: friendly astronaut on deep space ----------
function drawIcon(s) {
  const c = canvas(s);
  const u = s / 512;

  rrect(c, 0, 0, s, s, 96 * u, [9, 13, 26, 255]);
  vgrad(c, [18, 27, 54, 110], [5, 8, 18, 150]);

  // stars
  const stars = [[0.10, 0.18], [0.86, 0.14], [0.16, 0.80], [0.78, 0.86], [0.50, 0.07], [0.92, 0.50], [0.07, 0.52], [0.64, 0.92]];
  stars.forEach((p, i) => circle(c, p[0] * s, p[1] * s, (i % 3 ? 2.0 : 3.0) * u, [210, 226, 255, 170]));

  // ambient glow behind helmet
  circle(c, 256 * u, 190 * u, 165 * u, [56, 189, 248, 26], 46 * u);

  // jetpack
  rrect(c, 150 * u, 210 * u, 212 * u, 160 * u, 44 * u, [26, 32, 56, 255]);

  // arms
  rrect(c, 116 * u, 236 * u, 46 * u, 122 * u, 23 * u, [212, 220, 238, 255]);
  rrect(c, 350 * u, 236 * u, 46 * u, 122 * u, 23 * u, [212, 220, 238, 255]);

  // torso
  rrect(c, 156 * u, 206 * u, 200 * u, 196 * u, 66 * u, [228, 234, 246, 255]);
  rrect(c, 156 * u, 300 * u, 200 * u, 102 * u, 60 * u, [198, 208, 230, 255]);

  // chest panel
  rrect(c, 222 * u, 316 * u, 68 * u, 46 * u, 12 * u, [10, 16, 34, 255]);
  circle(c, 244 * u, 334 * u, 6 * u, [103, 232, 249, 255]);
  circle(c, 268 * u, 334 * u, 6 * u, [110, 231, 183, 255]);
  circle(c, 292 * u, 334 * u, 6 * u, [148, 163, 184, 255]);

  // helmet
  circle(c, 256 * u, 186 * u, 118 * u, [238, 242, 251, 255]);
  circle(c, 256 * u, 186 * u, 100 * u, [16, 24, 50, 255]);
  circle(c, 256 * u, 200 * u, 100 * u, [30, 58, 138, 52], 30 * u); // visor depth tint

  // eyes with glow
  circle(c, 222 * u, 192 * u, 28 * u, [56, 189, 248, 55], 12 * u);
  circle(c, 290 * u, 192 * u, 28 * u, [56, 189, 248, 55], 12 * u);
  rrect(c, 204 * u, 166 * u, 37 * u, 52 * u, 18.5 * u, [125, 211, 252, 255]);
  rrect(c, 271 * u, 166 * u, 37 * u, 52 * u, 18.5 * u, [125, 211, 252, 255]);
  rrect(c, 213 * u, 194 * u, 19 * u, 16 * u, 8 * u, [8, 47, 73, 255]);
  rrect(c, 280 * u, 194 * u, 19 * u, 16 * u, 8 * u, [8, 47, 73, 255]);
  circle(c, 212 * u, 174 * u, 5.5 * u, [240, 253, 255, 235]);
  circle(c, 279 * u, 174 * u, 5.5 * u, [240, 253, 255, 235]);

  // visor shine
  rrect(c, 198 * u, 118 * u, 74 * u, 13 * u, 6.5 * u, [255, 255, 255, 60]);

  // helmet rim light
  ring(c, 256 * u, 186 * u, 118 * u, 3 * u, [255, 255, 255, 80]);

  // antenna
  rrect(c, 344 * u, 70 * u, 8 * u, 42 * u, 4 * u, [226, 232, 244, 255]);
  circle(c, 348 * u, 62 * u, 11 * u, [103, 232, 249, 235]);

  return c;
}

// ---------- ICO writer (PNG-compressed entries) ----------
function makeIco(sizes) {
  const pngs = sizes.map((s) => ({ s, png: encodePNG(s, s, drawIcon(s).d) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const p of pngs) {
    const e = Buffer.alloc(16);
    e[0] = p.s >= 256 ? 0 : p.s;
    e[1] = p.s >= 256 ? 0 : p.s;
    e[2] = 0;
    e[3] = 0;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(p.png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += p.png.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

// ---------- outputs ----------
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'browser-extension'), { recursive: true });

fs.writeFileSync(path.join(root, 'assets', 'icon.png'), encodePNG(512, 512, drawIcon(512).d));
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), makeIco([16, 24, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(root, 'browser-extension', 'icon.png'), encodePNG(128, 128, drawIcon(128).d));

console.log('Icons generated: assets/icon.png, build/icon.ico, browser-extension/icon.png');
