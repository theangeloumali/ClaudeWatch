import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Browser preview of the Office renderer with the fixture feed: open /office.html.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  // Campus models are imported `?inline` (night-campus/glb-props.ts).
  assetsInclude: ['**/*.glb'],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/office-preview'),
    emptyOutDir: true,
    rollupOptions: {
      input: { office: resolve(__dirname, 'src/renderer/office.html') }
    }
  }
})
