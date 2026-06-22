import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

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
        id: '/',
        name: 'TIMES INC',
        short_name: 'TIMES',
        description: 'Control de jornada laboral — fichajes, vacaciones y comunicación de equipo',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#0B1020',
        background_color: '#0B1020',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/?source=pwa',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
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
            name: 'Solicitar vacaciones',
            short_name: 'Vacaciones',
            description: 'Ver y solicitar vacaciones',
            url: '/?tab=vacaciones',
            icons: [{ src: '/icon.svg', sizes: 'any' }]
          },
          {
            name: 'Mis mensajes',
            short_name: 'Mensajes',
            description: 'Chat con el administrador',
            url: '/?tab=mensajes',
            icons: [{ src: '/icon.svg', sizes: 'any' }]
          }
        ],
        screenshots: [
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'TIMES INC — Control de jornada'
          }
        ]
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
