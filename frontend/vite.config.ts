import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Used when running vite outside docker (in docker, nginx routes /api).
    proxy: {
      '/api': 'http://localhost:8000',
    },
    // In docker, the browser reaches the HMR WebSocket through Nginx on port 80
    // (VITE_HMR_CLIENT_PORT=80 set in docker-compose). Outside docker, default.
    hmr: process.env.VITE_HMR_CLIENT_PORT
      ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
      : undefined,
    watch: {
      // Windows + WSL2/Docker doesn't fire native fs events into containers.
      // Polling detects file changes reliably at the cost of slightly more CPU.
      usePolling: true,
      interval: 500,   // check every 500ms — snappy enough, not too heavy
    },
  },
})
