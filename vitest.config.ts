import { defineConfig } from 'vitest/config'

// The parent directory (/home/z/my-project) hosts a Next.js app whose
// postcss.config.mjs breaks Vite's upward config search — the inline empty
// PostCSS config below stops that lookup.
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
