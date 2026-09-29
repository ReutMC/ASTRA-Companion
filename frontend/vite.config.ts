import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Production-only CSP. In dev the React-refresh preamble is an inline module
 * script, so the CSP meta is injected only into the built output.
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  'img-src \'self\' data: blob:; media-src \'self\' blob:; connect-src *; font-src \'self\' data:'

function cspPlugin(): Plugin {
  return {
    name: 'astra-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  // Inline (empty) PostCSS config stops Vite from discovering unrelated
  // configs in parent directories (e.g. the Next.js showcase above).
  css: { postcss: {} },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
