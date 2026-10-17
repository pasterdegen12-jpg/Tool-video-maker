import process from 'node:process';
import { defineConfig } from 'vite'
import localMedia from './scripts/local-media.mjs'
import localAiLoopback from './scripts/local-ai-loopback.mjs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    localAiLoopback(),
    localMedia(),
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
      // Keep test credentials on the local test backend, never the public API.
      // Reserve the bridge namespace locally; never fall through to the cloud API.
      '/api/local-video': {
        target: 'http://127.0.0.1:8790',
        changeOrigin: true,
      },
      '/api/local-ai': {
        target: 'http://127.0.0.1:8789',
        changeOrigin: true,
      },
      '/api/gemini-test': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
      '/api': {
        target: 'https://www.aivideomaker.live', // Thêm www. để không bị Vercel đá redirect
        changeOrigin: true,
        secure: false,
      }
    }
  },
})