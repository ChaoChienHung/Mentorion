import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const RUNTIME_FILE = path.join(os.homedir(), '.mentorion', 'runtime.json')

function readRuntimeApiUrl(): string | null {
  try {
    if (!fs.existsSync(RUNTIME_FILE)) return null
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf-8')) as { api_url?: string }
    return parsed.api_url?.trim() || null
  } catch {
    return null
  }
}

function mentorionRuntimeRegistryPlugin(): Plugin {
  return {
    name: 'mentorion-runtime-registry',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address()
        const port = typeof addr === 'object' && addr ? addr.port : Number(process.env.VITE_PORT || 5173)
        const appUrl = `http://localhost:${port}`
        try {
          fs.mkdirSync(path.dirname(RUNTIME_FILE), { recursive: true })
          let current: Record<string, unknown> = {}
          if (fs.existsSync(RUNTIME_FILE)) {
            current = JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf-8')) as Record<string, unknown>
          }
          current.app_url = appUrl
          current.updated_at = new Date().toISOString()
          fs.writeFileSync(RUNTIME_FILE, `${JSON.stringify(current, null, 2)}\n`, 'utf-8')
        } catch {
          // Non-fatal if home directory is not writable
        }
      })
    },
  }
}

const backendTarget =
  process.env.VITE_MENTORION_API_URL ||
  (process.env.MENTORION_PORT ? `http://localhost:${process.env.MENTORION_PORT}` : null) ||
  readRuntimeApiUrl() ||
  'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), mentorionRuntimeRegistryPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: false,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
})
