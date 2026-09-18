import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Sin este plugin, esbuild transforma JSX con el runtime clásico
  // (React.createElement) en vez del automático que usa vite.config.js — un
  // archivo .jsx/.tsx sin `import React` explícito (el caso normal en este
  // proyecto) fallaba con "ReferenceError: React is not defined" en cuanto
  // se ejecutaba de verdad. Por eso EmployeeGastos.test.jsx llevaba tiempo
  // "pasando" solo porque nunca se ejecutaba (ver el fix de `include` más abajo).
  plugins: [react()],
  test: {
    // Los tests viven fuera de api/: Vercel interpreta cualquier .js dentro de
    // esa carpeta como una función serverless desplegable. auto-cierre-mensual.js
    // vive en la raíz (fuera de api/, sin ese riesgo) pero su test se quedaba
    // fuera también al no matchear 'src/**' — nunca se ejecutaba en
    // npm test/verify:deploy pese a existir.
    // '.test.jsx' se añade porque solo se cubría '.test.js' — EmployeeGastos.test.jsx
    // (y cualquier otro test de un componente .jsx) tampoco se había ejecutado nunca.
    include: ['src/**/*.test.{js,jsx,ts,tsx}', '*.test.js'],
    exclude: ['node_modules/**', '.claude/**', 'tests/**'],
    environment: 'jsdom',
    // Fija la zona horaria de negocio (RD, UTC-4, sin horario de verano) para que
    // los tests de fechas/jornada sean deterministas sin importar el TZ de quien
    // los ejecute — antes dependían del reloj local de la máquina.
    env: {
      TZ: 'America/Santo_Domingo',
      VITE_SB_URL: 'https://fake.supabase.co',
      VITE_SB_ANON: 'fake-anon-key',
    },
    // Los tests de qr.js comparan contra el origin real de producción
    // (decodeEmployeeQR rechaza QRs de otro origen) — sin esto, jsdom usa
    // http://localhost/ por defecto y esas comparaciones siempre fallan.
    environmentOptions: { jsdom: { url: 'https://times-inc.vercel.app' } },
  },
})
