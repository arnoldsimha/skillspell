import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

function getBackendUrl(): string {
  try {
    return execSync('portless get api.skillspell', { encoding: 'utf-8' }).trim()
  } catch {
    // Fallback when portless proxy is not running
    return 'http://localhost:3000'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    // Expose backend URL to client code; in production builds this will be empty
    // so the app falls back to relative '/api' paths (served by the same origin).
    __BACKEND_URL__: JSON.stringify(process.env.NODE_ENV === 'production' ? '' : getBackendUrl()),
  },
  server: {
    host: '127.0.0.1',
    port: parseInt(process.env.PORT || '5173', 10),
    proxy: {
      '/api': {
        target: getBackendUrl(),
        changeOrigin: true,
      },
      '/stream': {
        target: getBackendUrl(),
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
