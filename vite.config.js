import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.js',
      manifest: {
        name: 'TIMES INC',
        short_name: 'TIMES',
        description: 'Control de jornada laboral',
        theme_color: '#0B1020',
        background_color: '#0B1020',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon.svg',     sizes: 'any',      type: 'image/svg+xml' }
        ],
        shortcuts: [
          {
            name: 'Fichar entrada',
            short_name: 'Fichar',
            description: 'Registrar entrada de jornada',
            url: '/?tab=inicio',
            icons: [{ src: '/icon.svg', sizes: 'any' }]
          },
          {
            name: 'Mi jornada',
            short_name: 'Jornada',
            description: 'Ver horas trabajadas hoy',
            url: '/?tab=jornada',
            icons: [{ src: '/icon.svg', sizes: 'any' }]
          },
          {
            name: 'Vacaciones',
            short_name: 'Vacaciones',
            description: 'Ver y solicitar vacaciones',
            url: '/?tab=vacaciones',
            icons: [{ src: '/icon.svg', sizes: 'any' }]
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          state: ['zustand']
        }
      }
    }
  }
})
