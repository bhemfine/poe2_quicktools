import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // Native modules stay external; ESM-only packages are bundled into the CJS main bundle.
    build: { externalizeDeps: { exclude: ['electron-store', 'zod'] } },
  },
  preload: {},
  renderer: {
    plugins: [vue(), tailwindcss()],
  },
})
