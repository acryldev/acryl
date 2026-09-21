import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { installLocalPlugin, listLocalPlugins, removeLocalPlugin } from './install.js'
import { canonical, installState } from './reconcile.js'
import { verifyBlend } from './blend-capture.js'
import { readLockfile } from './provenance.js'
import { hashPackage } from './stage.js'
import { describePermissions, readManifest } from './manifest.js'

/**
 * Re-create a captured Blend (see blend-capture.js) in the active profile: the inverse of `/blend snapshot`. Human-typed, like `/reload new`, because it installs code
 * that runs with the user's permissions; the summary lists what each module requests.
 *
 *  1. verify the Blend against its own lock (nothing is installed from a Blend that no longer matches it);
 *  2. local modules: place the vendored source in the project extension scope (`<workspace>/.acryl-extensions/<name>/`, never overwriting a folder that differs) and install it through
 *     the same pipeline as everything else, so `/reload`, the startup pass and provenance apply to it unchanged;
 *  3. registry modules: `dsh plugin add name@version`, then compare the lockfile integrity with the locked digest and undo the install on a mismatch;
 *  4. modules already installed at the locked state are left alone (idempotent).
 *
 * @param {string} blendDir the captured directory (`<workspace>/.acryl/blend`)
 * @param {{ pnpm: any, live: any, profileDir: string }} services
 * @param {{ workspaceDir: string }} options
 * @returns {Promise<{ ok: boolean, results: Array<{ name: string, origin: string, status: string, detail?: string, permissions?: string }>, problems: string[] }>}
 */
export async function applyBlend(blendDir, services, options, fs = { existsSync, readFileSync }) {
  const verified = verifyBlend(blendDir, fs)
  if (!verified.ok) return { ok: false, results: [], problems: verified.problems }
  const lock = JSON.parse(fs.readFileSync(join(blendDir, 'blend.lock.json'), 'utf8'))
  const profile = JSON.parse(fs.readFileSync(join(services.profileDir, 'package.json'), 'utf8'))
  const installed = profile.dependencies ?? {}
  const results = []

  for (const module of lock.modules ?? []) {
    if (module.origin === 'local') {
      const vendored = join(blendDir, module.source)
      const folder = join(options.workspaceDir, '.acryl-extensions', basename(module.source))
      // A folder of the same name that differs from the locked source is somebody's work: report, never overwrite.
      if (fs.existsSync(join(folder, 'package.json')) && `sha256:${hashPackage(folder, 64)}` !== module.digest) {
        results.push({ name: module.name, origin: 'local', status: 'conflict', detail: `${folder} already exists and differs from the locked source; move it or re-capture` })
        continue
      }
      if (!fs.existsSync(join(folder, 'package.json'))) {
        mkdirSync(folder, { recursive: true })
        cpSync(vendored, folder, { recursive: true })
      }
      const manifest = JSON.parse(fs.readFileSync(join(folder, 'package.json'), 'utf8'))
      const permissions = describePermissions(readManifest(manifest).permissions)
      // Already installed from this folder and in sync with it: nothing to do (applying twice is harmless).
      const current = listLocalPlugins(services.profileDir, fs).find(plugin => plugin.name === module.name)
      if (current && canonical(current.installedFrom) === canonical(folder) && installState(current, hashPackage, fs) === 'in-sync') {
        results.push({ name: module.name, origin: 'local', status: 'unchanged', permissions })
        continue
      }
      const result = await installLocalPlugin({ path: folder }, services)
      results.push(result.ok
        ? { name: module.name, origin: 'local', status: result.action ?? 'installed', permissions }
        : { name: module.name, origin: 'local', status: 'failed', detail: (result.errors ?? []).join('; '), permissions })
    } else if (module.origin === 'registry') {
      if (typeof installed[module.name] === 'string' && (installed[module.name] === module.version || readLockfile(services.profileDir, fs).resolved.get(module.name) === module.version)) {
        results.push({ name: module.name, origin: 'registry', status: 'unchanged' })
        continue
      }
      const handle = services.pnpm.runPlugin(['add', `${module.name}@${module.version}`], options.workspaceDir)
      let output = ''
      if (handle.stdout) for await (const chunk of handle.stdout) output += chunk.toString()
      if (handle.stderr) for await (const chunk of handle.stderr) output += chunk.toString()
      const outcome = await handle.done
      if (outcome.exitCode !== 0) { results.push({ name: module.name, origin: 'registry', status: 'failed', detail: output.trim().slice(-300) || `exit ${outcome.exitCode}` }); continue }
      const integrity = readLockfile(services.profileDir, fs).integrity.get(`${module.name}@${module.version}`)
      if (module.digest && integrity !== module.digest) {
        await removeLocalPlugin({ package: module.name }, services)
        results.push({ name: module.name, origin: 'registry', status: 'failed', detail: `integrity mismatch: locked ${module.digest}, got ${integrity ?? 'none'}; the install was undone` })
        continue
      }
      results.push({ name: module.name, origin: 'registry', status: 'installed' })
    } else {
      results.push({ name: module.name, origin: module.origin, status: 'skipped', detail: `origin "${module.origin}" is recorded by spec only (${module.spec}); install it yourself` })
    }
  }
  return { ok: results.every(r => !['failed', 'conflict'].includes(r.status)), results, problems: [] }
}
