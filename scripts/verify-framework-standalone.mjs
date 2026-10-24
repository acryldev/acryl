#!/usr/bin/env node
/**
 * The framework outside this repository (spec 047, gate P6): pack the framework plugins, install the tarballs in an empty folder next to
 * nothing but Cordis, typecheck a small app under the published app profile (`acryl-router/tsconfig.app.json`), run it, and require that
 * it serves a route over a real socket and exits once its root context is disposed.
 *
 * `node scripts/verify-framework-standalone.mjs [--keep]`. Packing runs each package's `prepack` (its full check), so this is a release
 * gate, not part of `check:layout`. The folder is a fresh temporary directory, removed afterwards unless `--keep`.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = ['acryl-router', 'acryl-state', 'acryl-inspect', 'acryl-node-server']
const keep = process.argv.includes('--keep')

const folder = mkdtempSync(join(tmpdir(), 'acryl-framework-standalone-'))
const packs = join(folder, 'packs')
const app = join(folder, 'app')
mkdirSync(packs)
mkdirSync(app)
const run = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 })

try {
  for (const name of PACKAGES) run('corepack', ['pnpm', 'pack', '--pack-destination', packs], join(ROOT, 'plugins', name))
  const tarballs = Object.fromEntries(readdirSync(packs).map(file => [file.replace(/-\d+\.\d+\.\d+\.tgz$/u, ''), `file:../packs/${file}`]))
  for (const name of PACKAGES) if (tarballs[name] === undefined) throw new Error(`no tarball for ${name}`)

  writeFileSync(join(app, 'package.json'), `${JSON.stringify({
    name: 'standalone-app',
    private: true,
    type: 'module',
    dependencies: { '@deepseek-ai/cordis': '4.0.4', ...tarballs },
    devDependencies: { typescript: '6.0.3', '@types/node': '22.20.1' },
  }, null, 2)}\n`)
  writeFileSync(join(app, 'tsconfig.json'), `${JSON.stringify({
    extends: 'acryl-router/tsconfig.app.json',
    compilerOptions: { noEmit: true, allowImportingTsExtensions: true },
    include: ['app.ts'],
  }, null, 2)}\n`)
  writeFileSync(join(app, 'app.ts'), `import { Context } from '@deepseek-ai/cordis'
import * as router from 'acryl-router'
import { Acryl } from 'acryl-router'
import { schemaValidator } from 'acryl-router/helpers'
import { bodyLimit } from 'acryl-router/middleware'
import * as nodeServer from 'acryl-node-server'

const root = new Context()
root.plugin(router)
root.plugin(nodeServer, { port: 0 })
root.plugin({
  name: 'hello',
  inject: ['router'],
  apply(ctx: Context) {
    ctx.router.route('/', new Acryl().use(bodyLimit({ maxSize: 1024 })).get('/hello/:name', c => c.json({ hello: c.req.param('name') })))
  },
})
root.inject(['nodeServer'], async ctx => {
  const response = await fetch(\`\${ctx.nodeServer.url}/hello/world\`)
  console.log(\`served \${String(response.status)} \${JSON.stringify(await response.json())} \${typeof schemaValidator}\`)
  await root.fiber.dispose()
})
`)

  run('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], app)
  run('node', [join(app, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], app)
  const output = run('node', ['app.ts'], app).trim()
  if (output !== 'served 200 {"hello":"world"} function') throw new Error(`unexpected app output: ${output}`)
  console.log(`verify-framework-standalone: ${PACKAGES.join(', ')} installed from tarballs in an empty folder; the app typechecks under the app profile, ${output}, and exits`)
} catch (error) {
  const detail = error && typeof error === 'object' && 'stderr' in error ? `\n${String(error.stdout ?? '')}${String(error.stderr ?? '')}` : ''
  console.error(`verify-framework-standalone: ${error instanceof Error ? error.message : String(error)}${detail}`)
  process.exitCode = 1
} finally {
  if (keep) console.log(`verify-framework-standalone: kept ${folder}`)
  else rmSync(folder, { recursive: true, force: true })
}
