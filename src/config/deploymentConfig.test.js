import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8')

describe('deployment quality gate', () => {
  it('uses a deterministic install and verifies code before Vercel publishes it', () => {
    expect(vercel.installCommand).toBe('npm ci --include=dev')
    expect(vercel.buildCommand).toBe('npm run verify:deploy')
    expect(pkg.scripts['verify:deploy']).toBe('npm run typecheck && npm run verify:release')
    expect(viteConfig).toContain("'**/localai-*.js', '**/localAI-*.js', '**/localAI.worker-*.js'")
  })
})
