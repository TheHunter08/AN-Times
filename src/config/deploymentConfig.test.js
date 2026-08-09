import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'))
const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.js'), 'utf8')
const dailyBusinessWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/daily-business-crons.yml'), 'utf8')
const backupWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/backup-supabase.yml'), 'utf8')
const operationalWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/operational-crons.yml'), 'utf8')
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
    for (const ignoredAsset of [
      '**/localai-*.js',
      '**/localAI-*.js',
      '**/localAI.worker-*.js',
      '**/pdf-*.js',
      '**/pdfSignatureAnchor-*.js',
      '**/pdf.worker.min-*.mjs',
    ]) {
      expect(viteConfig).toContain(`'${ignoredAsset}'`)
    }
    expect(vercelIgnore).not.toContain('api/*.test.js')
    expect(vitestConfig).not.toContain('api/**/*.test.js')
    expect(apiTests).toEqual([])
  })

  it('uses the same supported Node major locally, in CI and on Vercel', () => {
    expect(pkg.engines.node).toBe('24.x')
    expect(localNodeVersion).toBe('24')
    expect(githubWorkflow).toContain('node-version: 24.x')
  })

  it('keeps GitHub and Vercel on the same release gate', () => {
    expect(githubWorkflow).toContain('run: npm ci --include=dev')
    expect(githubWorkflow).toContain('run: npm run verify:deploy')
    expect(githubWorkflow).not.toContain('run: npm run build')
    expect(githubWorkflow).not.toContain('run: npm run test\n')
  })

  it('uses evening reminder slots to reinforce autoclose without extra crons', () => {
    const rewrites = new Map(vercel.rewrites.map(item => [item.source, item.destination]))
    expect(vercel.crons).toHaveLength(10)
    expect(rewrites.get('/api/cron-reminders-midday')).toBe('/api/cron-reminders')
    expect(rewrites.get('/api/cron-reminders-evening')).toBe('/api/cron-reminders-and-autoclose')
    expect(rewrites.get('/api/cron-reminders-night')).toBe('/api/cron-reminders-and-autoclose')
    expect(rewrites.get('/api/health')).toBe('/api/admin-tools?op=health')
  })

  it('keeps GitHub backstops for every daily business process', () => {
    expect(dailyBusinessWorkflow).toContain('/api/cron-reports')
    expect(dailyBusinessWorkflow).toContain('/api/cron-monthly-close')
    expect(dailyBusinessWorkflow).toContain('Authorization: Bearer ${CRON_SECRET}')
    expect(backupWorkflow).toContain('/api/backup')
    expect(backupWorkflow).toContain('Verificar backup productivo y registrar salud')
    expect(operationalWorkflow).toContain('/api/health')
    expect(pkg.scripts['verify:backup-restore']).toBe('node scripts/verify-backup-restore.mjs')
  })
})
