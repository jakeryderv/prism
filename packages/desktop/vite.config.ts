import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// Mirrors create-tauri-app's solid template: fixed port so tauri.conf.json's devUrl is
// stable, and src-tauri excluded from the watcher so Rust rebuilds do not trigger reloads.
export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: 'es2022' },
})
