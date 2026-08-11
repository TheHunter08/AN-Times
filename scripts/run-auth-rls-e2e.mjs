import { spawn } from 'node:child_process'

const npmCli = process.env.npm_execpath
const secureEnv = {
  ...process.env,
  CI: '1',
  VITE_SECURITY_MODE: 'auth_rls',
  VITE_SECURITY_ACTIVATION_SEAL: 'TIMES_INC_AUTH_RLS_2026_08_11',
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env:secureEnv, stdio:'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0
      ? resolve()
      : reject(new Error(`${command} ${args.join(' ')} terminó con código ${code}`)))
  })
}

if (!npmCli) throw new Error('No se pudo localizar npm-cli.js')
await run(process.execPath, [npmCli, 'run', 'build'])
await run(process.execPath, [
  'node_modules/@playwright/test/cli.js', 'test', 'tests/security-auth-rls.spec.js',
  '--project=chromium', '--workers=1', '--retries=0',
])
