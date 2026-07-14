import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['node_modules/**', '.claude/**', 'tests/**'],
    environment: 'jsdom',
    // Fija la zona horaria de negocio (RD, UTC-4, sin horario de verano) para que
    // los tests de fechas/jornada sean deterministas sin importar el TZ de quien
    // los ejecute — antes dependían del reloj local de la máquina.
    env: { TZ: 'America/Santo_Domingo' },
    // Los tests de qr.js comparan contra el origin real de producción
    // (decodeEmployeeQR rechaza QRs de otro origen) — sin esto, jsdom usa
    // http://localhost/ por defecto y esas comparaciones siempre fallan.
    environmentOptions: { jsdom: { url: 'https://times-inc.vercel.app' } },
  },
})
