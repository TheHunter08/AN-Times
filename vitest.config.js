import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'api/**/*.test.js'],
    exclude: ['node_modules/**', '.claude/**', 'tests/**'],
    environment: 'jsdom',
    // Fija la zona horaria de negocio (RD, UTC-4, sin horario de verano) para que
    // los tests de fechas/jornada sean deterministas sin importar el TZ de quien
    // los ejecute — antes dependían del reloj local de la máquina.
    // SUPABASE_JWT_SECRET/VITE_SB_*: api/pin-login.js los lee como constantes de
    // módulo (igual que el resto de funciones en api/*.js) — deben existir ANTES
    // de que el import se resuelva, así que no se pueden fijar en beforeEach.
    env: {
      TZ: 'America/Santo_Domingo',
      SUPABASE_JWT_SECRET: 'unit-test-secret',
      VITE_SB_URL: 'https://fake.supabase.co',
      VITE_SB_ANON: 'fake-anon-key',
    },
    // Los tests de qr.js comparan contra el origin real de producción
    // (decodeEmployeeQR rechaza QRs de otro origen) — sin esto, jsdom usa
    // http://localhost/ por defecto y esas comparaciones siempre fallan.
    environmentOptions: { jsdom: { url: 'https://times-inc.vercel.app' } },
  },
})
