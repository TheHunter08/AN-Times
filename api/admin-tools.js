// Agrupa operaciones administrativas protegidas en una sola función de Vercel.
// Las rutas públicas históricas se conservan mediante rewrites en vercel.json.
export { default } from '../src/server/adminEndpoints.js'
