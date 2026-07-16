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
const INITIAL_BUDGET = 230 * 1024
if (totalGzip > INITIAL_BUDGET) {
  throw new Error(`App shell inicial: ${(totalGzip / 1024).toFixed(1)} KiB gzip; presupuesto: 230 KiB`)
}

const assetNames = await readdir(new URL('assets/', DIST))
const precacheSource = await readFile(new URL('sw.js', DIST), 'utf8')
const forbiddenPrecache = assetNames.filter(name =>
  /^(localai-|localAI\.worker-)/i.test(name) && precacheSource.includes(name)
)
if (forbiddenPrecache.length) {
  throw new Error(`La IA local pesada entró en el precache: ${forbiddenPrecache.join(', ')}`)
}

console.log(`App shell inicial: ${(totalGzip / 1024).toFixed(1)} KiB gzip / 230 KiB`)
console.log(`Activos iniciales: ${rows.map(row => row.file).join(', ')}`)
console.log(`IA local excluida del precache: correcto`)
