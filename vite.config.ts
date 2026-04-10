import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import type { PluginOption } from 'vite'

export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()]

  if (mode === 'analyze') {
    plugins.push(
      visualizer({
        filename: 'stats.html',
        emitFile: true,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
        title: 'נגרות מידות — bundle',
      }),
    )
  }

  return {
    plugins,
    server: {
      // מאפשר גישה מהטלפון/מכשירים אחרים באותה רשת Wi‑Fi (לא רק מ-localhost)
      host: true,
      port: 5173,
    },
  }
})
