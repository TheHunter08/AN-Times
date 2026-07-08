import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['node_modules/**', '.claude/**', 'tests/**'],
    environment: 'jsdom',
    // Los tests de qr.js comparan contra el origin real de producción
    // (decodeEmployeeQR rechaza QRs de otro origen) — sin esto, jsdom usa
    // http://localhost/ por defecto y esas comparaciones siempre fallan.
    environmentOptions: { jsdom: { url: 'https://times-inc.vercel.app' } },
  },
})
