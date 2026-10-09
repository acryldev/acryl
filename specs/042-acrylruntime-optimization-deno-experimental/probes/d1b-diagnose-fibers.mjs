// D1 follow-up: serveWeb's own serving mode (d1-deno-host.mjs) reports "no answer" with no printed
// error under Deno. This probe boots the same web engine host directly (bypassing serveWeb's thin
// wrapper, which only reads ctx.get('webServer'/'webStartup') after boot and never inspects fiber
// state) and dumps every Cordis Fiber's state. A fiber that FAILED stores its error on `_error`
// (TS-private, not JS-private, so readable here) without rejecting the host's own boot promise -
// which is exactly why d1-deno-host.mjs's `.catch()` never fires.
//
// Run from the repository root, with a throwaway ACRYL_HOME and a spare ACRYL_WEB_PORT (never the
// real ones, never 3080 - this boots a real WebServer fiber, same as d1-deno-host.mjs):
//   T=$(mktemp -d); mkdir -p $T/home $T/acryl
//   HOME=$T/home ACRYL_HOME=$T/acryl ACRYL_WEB_PORT=<spare> \
//     deno run -A --node-modules-dir=manual specs/042-acrylruntime-optimization-deno-experimental/probes/d1b-diagnose-fibers.mjs
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync, lstatSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? (reason.stack ?? reason.message) : reason)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err instanceof Error ? (err.stack ?? err.message) : err)
})

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const port = Number(process.env.ACRYL_WEB_PORT)
if (!process.env.ACRYL_HOME || !Number.isInteger(port) || port === 3080) {
  console.error('set ACRYL_HOME to a throwaway folder and ACRYL_WEB_PORT to a spare port (not 3080)')
  process.exit(2)
}

const anchorPkgUrl = pathToFileURL(process.env.PAYLOAD ? resolve(process.env.PAYLOAD, 'package.json') : resolve(repo, 'apps/acryl-web/package.json')) // PAYLOAD: a d6-payload.mjs output with acryl-harness-runtime copied into its node_modules
const anchorRequire = createRequire(anchorPkgUrl)

// Same symlink shape engine-dsh.ts's materializeProfilePackage() already uses for ACRYL-owned
// packages, applied here to the pinned Harness bundle packages too (F6 of the findings doc: this
// alone does not fix D1, but it rules out "not installed" as the cause and keeps the profile's
// node_modules consistent while the real blocker, printed below, is something else entirely).
function materialize(profileDir, packageName) {
  const manifestPath = anchorRequire.resolve(`${packageName}/package.json`)
  const sourceDir = dirname(manifestPath)
  const linkPath = join(profileDir, 'node_modules', packageName)
  mkdirSync(dirname(linkPath), { recursive: true })
  let hasEntry = true
  try { lstatSync(linkPath) } catch { hasEntry = false }
  if (hasEntry) {
    let existingTarget
    try { existingTarget = realpathSync.native(linkPath) } catch { existingTarget = undefined }
    if (existingTarget === realpathSync.native(sourceDir)) return
    rmSync(linkPath, { force: true, recursive: true })
  }
  symlinkSync(sourceDir, linkPath, 'dir')
}

const { createAcrylEngineHost, createWebEngineDefinition } = await import(pathToFileURL(anchorRequire.resolve('acryl-harness-runtime')).href)
const { provideCmdline } = await import(pathToFileURL(anchorRequire.resolve('@deepseek-ai/dsh-cmdline')).href)

const bootOnce = () => createAcrylEngineHost({
  engines: [createWebEngineDefinition(anchorPkgUrl.href)],
  initialEngine: 'dsh',
  prepare: hostCtx => { provideCmdline(hostCtx, { args: [], exit: () => {} }) },
})

// Pass 1: let initProfile()/loadProfile() create the profile folder (package.json, cordis.yml, …).
const profileDir = join(process.env.ACRYL_HOME, '.dsh', 'profiles', 'web')
try {
  await (await bootOnce()).dispose()
} catch (error) {
  console.error('pre-boot pass errored:', error?.stack ?? error)
}

materialize(profileDir, '@deepseek-ai/dsh-base')
materialize(profileDir, '@deepseek-ai/dsh-web-app')

// Pass 2: the real boot, with both packages now resolvable from the profile's own node_modules.
const host = await bootOnce()
const ctx = host.ctx
await new Promise((done) => setTimeout(done, 3000)) // let any async activation settle

console.error('--- fiber states (0=PENDING 1=LOADING 2=ACTIVE 3=FAILED 4=DISPOSED 5=UNLOADING) ---')
for (const [, runtime] of ctx.registry.entries()) {
  for (const fiber of runtime.fibers) {
    const injectKeys = Object.keys(fiber.inject ?? {})
    if (process.env.ONLY_PROBLEMS === '1' && fiber.state === 2) continue
    console.error(`${(runtime.name ?? '(anonymous)').padEnd(40)} state=${fiber.state} inject=[${injectKeys.join(',')}]`)
    if (fiber.state === 3 && fiber._error) {
      console.error('  ERROR:', fiber._error?.stack ?? fiber._error)
    }
  }
}
console.error('--- services ---')
for (const name of ['webServer', 'webStartup', 'connection']) {
  console.error(`${name}: ${ctx.get(name) !== undefined ? 'present' : 'MISSING'}`)
}

await host.dispose()
process.exit(0)
