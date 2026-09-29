/**
 * ASTRA desktop build script.
 * Bundles TypeScript main + preload with esbuild. Main bundles the agent core
 * directly from ../agent/src (TypeScript sources), so no pre-compiled agent
 * output is required during development.
 */
import { build } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, 'dist')
mkdirSync(distDir, { recursive: true })

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  external: ['electron', 'ws'],
  logLevel: 'info',
}

await build({
  ...common,
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile: join(distDir, 'main.js'),
})

await build({
  ...common,
  entryPoints: [join(here, 'src', 'preload.ts')],
  outfile: join(distDir, 'preload.js'),
})

// Tray icon is copied next to the bundle so it resolves both from the asar
// archive (packaged) and from desktop/dist (development).
try {
  cpSync(join(here, '..', 'assets', 'icons', 'tray.png'), join(distDir, 'tray.png'))
} catch {
  // assets may be missing in a partial checkout; tray.ts falls back gracefully
}

console.log('[astra-desktop] build complete → dist/main.js, dist/preload.js')
