import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each emitted file must stay under the framework repository's commit-size guard, and three
// alone is past it. It ships as two modules, so it is split along that line.
function officeChunk(id: string): string | undefined {
  if (id.includes('/src/office/sim/')) return 'simulation'
  if (!id.includes('/node_modules/')) return undefined
  if (id.includes('/three/build/three.core')) return 'three-core'
  if (id.includes('/node_modules/three/')) return 'three-webgl'
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
  return 'vendor'
}

// The Office page for the standalone server (src/office-web). File names carry no content
// hash, so a later sync into the framework repository changes files instead of adding them.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/office-web/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: { office: resolve(__dirname, 'src/renderer/office.html') },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks: officeChunk
      }
    }
  }
})
