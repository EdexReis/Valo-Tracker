import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } }
  },
  renderer: {
    resolve: { alias: { '@shared': shared } },
    plugins: [react()],
    css: {
      postcss: {
        plugins: [tailwindcss({ config: resolve(__dirname, 'tailwind.config.js') }), autoprefixer()]
      }
    }
  }
})
