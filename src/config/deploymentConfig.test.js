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
const anomalyWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/anomaly-detector.yml'), 'utf8')
const weeklyWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/weekly-summary.yml'), 'utf8')
const keepaliveWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/supabase-keepalive.yml'), 'utf8')
const cleanupWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/cleanup-audit-notis.yml'), 'utf8')
const cleanupScript = readFileSync(resolve(process.cwd(), 'cleanup-audit-notis.js'), 'utf8')
const localNodeVersion = readFileSync(resolve(process.cwd(), '.nvmrc'), 'utf8').trim()
const apiTests = readdirSync(resolve(process.cwd(), 'api')).filter(name => name.endsWith('.test.js'))

describe('deployment quality gate', () => {
  it('uses a deterministic install and verifies code before Vercel publishes it', () => {
    expect(vercel.installCommand).toBe('npm ci --include=dev')
    expect(vercel.buildCommand).toBe('npm run verify:deploy')
    // La 4.5 mantiene el tipado limpio: Vercel debe ejecutar TypeScript antes
    // de las pruebas y del build para impedir publicar una integración rota.
    expect(pkg.scripts['verify:deploy']).toBe('npm run typecheck && npm run verify:release')
    for (const ignoredAsset of [
      '**/localai-*.js',
      '**/localAI-*.js',
      '**/localAI.worker-*.js',
      '**/pdf-*.js',
      '**/pdfSignatureAnchor-*.js',
      '**/pdf.worker.min-*.mjs',
      '**/documentSigning-*.js',
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
    expect(githubWorkflow).toContain('run: npx playwright install --with-deps chromium')
    expect(githubWorkflow).toContain('run: npm run test:e2e:smoke')
    expect(githubWorkflow).toContain('run: npm run test:e2e:auth-rls')
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
    expect(backupWorkflow).toContain('Crear y verificar backup productivo')
    expect(backupWorkflow).toContain('Validar evidencia de restauración')
    expect(operationalWorkflow).toContain('/api/health')
    expect(pkg.scripts['verify:backup-restore']).toBe('node scripts/verify-backup-restore.mjs')
  })

  it('keeps scheduled jobs compatible with Auth/RLS and legal retention', () => {
    expect(backupWorkflow).toContain('/api/backup')
    expect(backupWorkflow).toContain('r.verified')
    expect(backupWorkflow).toContain('r.restorable')
    expect(backupWorkflow).not.toContain('/rest/v1/app_data')
    expect(backupWorkflow).not.toContain('VITE_SB_ANON')

    expect(cleanupWorkflow).toContain('SB_SERVICE_KEY')
    expect(cleanupWorkflow).not.toContain('VITE_SB_ANON')
    expect(cleanupScript).toContain('AUDIT_RETENTION_YEARS = 4')
    expect(cleanupScript).toContain('/rest/v1/audit_events')
    expect(cleanupScript).toContain('SB_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY')

    for (const legacyWorkflow of [anomalyWorkflow, weeklyWorkflow, keepaliveWorkflow]) {
      expect(legacyWorkflow).not.toMatch(/^\s*schedule:/m)
      expect(legacyWorkflow).not.toContain('/rest/v1/app_data')
      expect(legacyWorkflow).not.toContain('VITE_SB_ANON')
    }
    expect(anomalyWorkflow).toContain('/api/cron-autoclose')
    expect(weeklyWorkflow).toContain('/api/cron-reminders')
    expect(keepaliveWorkflow).toContain('/api/health')
  })
})
