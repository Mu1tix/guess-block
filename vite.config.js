import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/wiki-api': {
        target: 'https://wiki.biligame.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wiki-api/, '/mc'),
      },
    },
  },
})
