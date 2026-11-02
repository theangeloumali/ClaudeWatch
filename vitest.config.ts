import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  // Campus models are imported `?inline` (night-campus/glb-props.ts).
  assetsInclude: ['**/*.glb'],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/__tests__/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'out'],
    environmentMatchGlobs: [
      ['src/main/**/*.test.ts', 'node'],
      ['src/bridge/**/*.test.ts', 'node'],
      ['src/shared/**/*.test.ts', 'node'],
      ['src/office/sim/**/*.test.ts', 'node'],
      ['src/office-host/**/*.test.ts', 'node'],
      ['src/office-web/**/*.test.ts', 'node']
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules', 'out', '*.config.*']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  }
})
