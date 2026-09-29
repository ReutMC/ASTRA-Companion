#!/usr/bin/env node
/* ASTRA — optional icon helper.
 *
 * Converts assets/icons/astra.png → assets/icons/astra.ico using the `to-ico`
 * package (and `sharp` for multi-size embedding when available).
 *
 * ⚠ NOT part of the build pipeline: electron-builder converts the 512px PNG to
 * an .ico automatically when packaging. This script exists only if you want a
 * checked-in .ico (e.g. for a plain NSIS tweak or a favicon).
 *
 * Usage:  npm i -D to-ico sharp   (optional)   then   node scripts/make-ico.mjs
 * Behaviour: never throws — prints a skip reason and exits 0 when deps missing.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPng = path.join(repoRoot, 'assets', 'icons', 'astra.png');
const outIco = path.join(repoRoot, 'assets', 'icons', 'astra.ico');

async function loadOptional(name) {
  try {
    const mod = await import(name);
    return mod.default || mod;
  } catch {
    return null;
  }
}

async function main() {
  let toIco;
  try {
    toIco = await loadOptional('to-ico');
  } catch {
    toIco = null;
  }
  if (!toIco) {
    console.log('[make-ico] `to-ico` is not installed — skipping (npm i -D to-ico to enable).');
    return;
  }

  let png;
  try {
    png = await readFile(srcPng);
  } catch {
    console.log('[make-ico] source not found: ' + srcPng + ' — skipping.');
    return;
  }

  // Prefer a proper multi-size ICO via sharp; fall back to the single PNG.
  let inputs = [png];
  const sharp = await loadOptional('sharp');
  if (sharp) {
    try {
      const sizes = [16, 32, 48, 64, 128, 256];
      inputs = await Promise.all(sizes.map((s) => sharp(png).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()));
      console.log('[make-ico] embedding sizes: ' + sizes.join(', '));
    } catch (e) {
      console.log('[make-ico] sharp resize failed (' + (e && e.message || e) + ') — using single source PNG.');
      inputs = [png];
    }
  } else {
    console.log('[make-ico] sharp unavailable — single-size ICO.');
  }

  const ico = await toIco(inputs);
  await writeFile(outIco, ico);
  console.log('[make-ico] wrote ' + outIco);
}

main().catch((e) => {
  console.log('[make-ico] skipped: ' + (e && e.message || e));
});
