import { defineConfig } from 'vitest/config'
import { xtermCssPlugin } from './scripts/xterm-css-plugin.mjs'

export default defineConfig({
  plugins: [xtermCssPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
})
