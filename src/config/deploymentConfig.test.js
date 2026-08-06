import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8')
const vercelIgnore = readFileSync(resolve(process.cwd(), '.vercelignore'), 'utf8')
const vitestConfig = readFileSync(resolve(process.cwd(), 'vitest.config.js'), 'utf8')
const githubWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
const localNodeVersion = readFileSync(resolve(process.cwd(), '.nvmrc'), 'utf8').trim()
const apiTests = readdirSync(resolve(process.cwd(), 'api')).filter(name => name.endsWith('.test.js'))

describe('deployment quality gate', () => {
  it('uses a deterministic install and verifies code before Vercel publishes it', () => {
    expect(vercel.installCommand).toBe('npm ci --include=dev')
    expect(vercel.buildCommand).toBe('npm run verify:deploy')
    expect(pkg.scripts['verify:deploy']).toBe('npm run typecheck && npm run verify:release')
    expect(viteConfig).toContain("'**/localai-*.js', '**/localAI-*.js', '**/localAI.worker-*.js'")
    expect(vercelIgnore).not.toContain('api/*.test.js')
    expect(vitestConfig).not.toContain('api/**/*.test.js')
    expect(apiTests).toEqual([])
  })

  it('uses the same supported Node major locally, in CI and on Vercel', () => {
    expect(pkg.engines.node).toBe('24.x')
    expect(localNodeVersion).toBe('24')
    expect(githubWorkflow).toContain('node-version: 24.x')
  })
})
