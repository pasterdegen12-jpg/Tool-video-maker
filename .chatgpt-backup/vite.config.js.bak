import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  server: {
    host: true, 
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },

    // 🚀 BỔ SUNG CỤC PROXY NÀY VÀO ĐÂY
proxy: {
      '/api': {
        target: 'https://www.aivideomaker.live', // Thêm www. để không bị Vercel đá redirect
        changeOrigin: true,
        secure: false,
      }
    }
  },
})