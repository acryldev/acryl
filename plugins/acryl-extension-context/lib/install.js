import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * Static checks for the two failures measured in spec 037 research Q7 that make
 * a package install but never go live, or not install at all. Cheap and
 * deterministic; the full mount-level verification is a separate task.
 * @returns {{ name?: string, errors: string[] }}
 */
export function lintPackageDir(dir, fs = { existsSync, readFileSync }) {
  const errors = []
  const manifestPath = join(dir, 'package.json')
  if (!fs.existsSync(manifestPath)) return { errors: [`no package.json in ${dir}`] }
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (cause) { return { errors: [`package.json is not valid JSON: ${cause instanceof Error ? cause.message : cause}`] } }
  if (typeof pkg.name !== 'string' || pkg.name === '') errors.push('package.json needs a "name"')
  const patch = pkg.dsh?.bundle?.patch
  if (typeof patch !== 'string' || patch === '') {
    errors.push('package.json needs "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }; without it the package is installed as a plain dependency but never added to the profile')
  } else {
    if (!fs.existsSync(join(dir, patch))) errors.push(`the bundle patch ${patch} does not exist`)
    if (Array.isArray(pkg.files) && !pkg.files.some(f => join(dir, f) === join(dir, patch) || patch.replace(/^\.\//u, '') === f.replace(/^\.\//u, ''))) errors.push(`the bundle patch ${patch} is not in "files"`)
  }
  const exp = pkg.exports
  if (exp !== undefined && (typeof exp !== 'object' || exp === null || !('./package.json' in exp))) {
    errors.push('"exports" must include "./package.json" (for example { ".": "./index.js", "./package.json": "./package.json" }); otherwise the package installs but live activation fails with ERR_PACKAGE_PATH_NOT_EXPORTED')
  }
  return { name: pkg.name, errors }
}

async function drain(stream) {
  let text = ''
  if (stream) for await (const chunk of stream) text += chunk.toString()
  return text
}

async function runPlugin(pnpm, args, dir) {
  const handle = pnpm.runPlugin(args, dir)
  const [outcome, stdout, stderr] = await Promise.all([handle.done, drain(handle.stdout), drain(handle.stderr)])
  return { ok: outcome.exitCode === 0, exitCode: outcome.exitCode, output: `${stdout}${stderr}`.trim().slice(-600) }
}

/**
 * Local, in-place delivery (spec 037 FR-016): lint, `dsh plugin add file:<dir>`, an
 * EXPLICIT live activation, and a compensating `remove` on any failure, because CLI
 * and Web have no install recovery log (measured: a plugin whose apply() threw stayed
 * in the profile until removed). Services are read at call time, never captured.
 * @param {{ path: string, cwd?: string }} input
 * @param {{ pnpm: any, live: any, cwd?: string }} services
 */
export async function installLocalPlugin(input, services, fs) {
  const dir = isAbsolute(input.path) ? input.path : resolve(services.cwd ?? process.cwd(), input.path)
  const lint = lintPackageDir(dir, fs)
  if (lint.errors.length > 0 || lint.name === undefined) {
    return { ok: false, stage: 'check', errors: lint.errors, next: 'Fix these in the package and call the tool again. See docs/start-here/this-runtime.md (package contract).' }
  }
  if (!services.pnpm) return { ok: false, stage: 'services', errors: ['the plugin install service (desktopPnpm) is not available in this runtime'] }
  if (!services.live) return { ok: false, stage: 'services', errors: ['live plugin activation (livePluginActivation) is not available in this runtime'] }

  const added = await runPlugin(services.pnpm, ['add', `file:${dir}`], dir)
  if (!added.ok) return { ok: false, stage: 'install', errors: [`dsh plugin add failed (exit ${added.exitCode})`], detail: added.output }

  try {
    await services.live.activate(lint.name)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const removed = await runPlugin(services.pnpm, ['remove', lint.name], dir)
    return { ok: false, stage: 'activate', errors: [message], rolledBack: removed.ok, next: 'The install was undone. Fix the error above, then call the tool again.' }
  }
  return { ok: true, package: lint.name, status: services.live.statusOf(lint.name) ?? 'unknown' }
}
