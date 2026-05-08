import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      // Tell the browser to connect HMR WebSocket through Nginx on port 80
      clientPort: 80,
    },
    watch: {
      // Windows + WSL2/Docker doesn't fire native fs events into containers.
      // Polling detects file changes reliably at the cost of slightly more CPU.
      usePolling: true,
      interval: 500,   // check every 500ms — snappy enough, not too heavy
    },
  },
})
