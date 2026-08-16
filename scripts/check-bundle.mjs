import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const DIST = new URL('../dist/', import.meta.url)
const html = await readFile(new URL('index.html', DIST), 'utf8')
const initialAssets = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)]
  .map(match => match[1])
const uniqueAssets = [...new Set(initialAssets)]
const rows = []

for (const file of uniqueAssets) {
  const content = await readFile(new URL(`assets/${file}`, DIST))
  rows.push({ file, raw:content.length, gzip:gzipSync(content).length })
}

const totalGzip = rows.reduce((sum, row) => sum + row.gzip, 0)
// Ampliado desde 230 KiB para dejar margen al rediseño visual (2026-08-16):
// el shell inicial (login) gana peso con la nueva dirección visual.
const INITIAL_BUDGET = 280 * 1024
if (totalGzip > INITIAL_BUDGET) {
  throw new Error(`App shell inicial: ${(totalGzip / 1024).toFixed(1)} KiB gzip; presupuesto: 280 KiB`)
}

const assetNames = await readdir(new URL('assets/', DIST))
const precacheSource = await readFile(new URL('sw.js', DIST), 'utf8')
const onDemandAssetPattern = /^(?:localai-|localAI\.worker-|pdf-|pdfSignatureAnchor-|pdf\.worker\.min-)/i
const forbiddenPrecache = assetNames.filter(name =>
  onDemandAssetPattern.test(name) && precacheSource.includes(name)
)
if (forbiddenPrecache.length) {
  throw new Error(`Un activo pesado bajo demanda entró en el precache: ${forbiddenPrecache.join(', ')}`)
}

const precachedAssets = assetNames.filter(name => precacheSource.includes(name))
const precacheRawBytes = (await Promise.all(
  precachedAssets.map(async name => (await readFile(new URL(`assets/${name}`, DIST))).length)
)).reduce((sum, size) => sum + size, 0)
// Presupuesto del conjunto offline completo (no solo del shell inicial).
// Ampliado desde 1900 KiB (2026-08-16) para dar margen al rediseño visual;
// sigue evitando que una dependencia pesada se cuele sin control.
const PRECACHE_RAW_BUDGET = 2400 * 1024
if (precacheRawBytes > PRECACHE_RAW_BUDGET) {
  throw new Error(`Precache de assets: ${(precacheRawBytes / 1024).toFixed(1)} KiB; presupuesto: 2400 KiB`)
}

console.log(`App shell inicial: ${(totalGzip / 1024).toFixed(1)} KiB gzip / 280 KiB`)
console.log(`Activos iniciales: ${rows.map(row => row.file).join(', ')}`)
console.log(`Precache de assets: ${(precacheRawBytes / 1024).toFixed(1)} KiB / 2400 KiB`)
console.log(`IA local y motores PDF excluidos del precache: correcto`)
