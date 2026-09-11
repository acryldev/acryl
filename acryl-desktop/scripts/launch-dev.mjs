#!/usr/bin/env node
/** Launch the development build from a macOS bundle branded as ACRYL. */

import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const PRODUCT_NAME = 'ACRYL'
const DEVELOPMENT_BUNDLE_ID = 'dev.acryl.desktop.development'
const DEV_ENTITLEMENTS_PATH = join(packageRoot, 'build', 'entitlements.dev.plist')
// Must match `DESKTOP_DEV_RESTART_EXIT_CODE` in `../src/shutdown.ts`. That
// module is compiled TypeScript and this is a standalone script run directly
// by Node, so the two sides mirror the literal rather than sharing an import.
export const DEV_RESTART_EXIT_CODE = 43

/** Replace one string value in an XML property list and fail if the key is absent. */
export function setPlistString(source, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`, 'u')
  if (!pattern.test(source)) throw new Error(`launch-dev: Electron Info.plist has no ${key} string`)
  return source.replace(pattern, `$1${value}$2`)
}

/** Derive the containing .app bundle from Electron's macOS executable path. */
export function electronAppPath(executable) {
  const macosDirectory = dirname(executable)
  const contentsDirectory = dirname(macosDirectory)
  const appPath = dirname(contentsDirectory)
  if (
    basename(macosDirectory) !== 'MacOS'
    || basename(contentsDirectory) !== 'Contents'
    || !basename(appPath).endsWith('.app')
  ) {
    throw new Error(`launch-dev: Electron executable is not inside a macOS app bundle: ${executable}`)
  }
  return appPath
}

/** Build a temporary ad-hoc-signed ACRYL.app around the development Electron runtime. */
export async function prepareDarwinDevelopmentBundle(electronExecutable) {
  const sourceApp = electronAppPath(electronExecutable)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'acryl-electron-dev-'))
  const destinationApp = join(temporaryRoot, `${PRODUCT_NAME}.app`)
  try {
    try {
      await execFileAsync('/bin/cp', ['-cR', sourceApp, destinationApp])
    }
    catch {
      await execFileAsync('/bin/cp', ['-R', sourceApp, destinationApp])
    }
    const plistPath = join(destinationApp, 'Contents', 'Info.plist')
    let plist = await readFile(plistPath, 'utf8')
    plist = setPlistString(plist, 'CFBundleDisplayName', PRODUCT_NAME)
    plist = setPlistString(plist, 'CFBundleName', PRODUCT_NAME)
    plist = setPlistString(plist, 'CFBundleExecutable', PRODUCT_NAME)
    plist = setPlistString(plist, 'CFBundleIdentifier', DEVELOPMENT_BUNDLE_ID)
    await writeFile(plistPath, plist)

    const sourceExecutable = join(destinationApp, 'Contents', 'MacOS', basename(electronExecutable))
    const brandedExecutable = join(destinationApp, 'Contents', 'MacOS', PRODUCT_NAME)
    await rename(sourceExecutable, brandedExecutable)
    // `--deep` alone (no entitlements, no hardened runtime) leaves every
    // nested Electron Helper.app ad-hoc-signed but WITHOUT
    // `com.apple.security.inherit` — after the outer app is renamed/
    // re-identified, each Helper then computes a mismatched Mach service
    // name for the renderer/GPU Mach-port rendezvous handshake and exits
    // immediately ("Unknown service name" / "No rendezvous client,
    // terminating process"), which surfaces as a silent renderer-boot-health
    // timeout. Signing with the same entitlements (and hardened runtime)
    // app-builder-lib's own packaged `dist:mac` build already signs
    // successfully with fixes the rendezvous for this ad-hoc dev rebrand too.
    await execFileAsync('/usr/bin/codesign', [
      '--force',
      '--deep',
      '--options', 'runtime',
      '--entitlements', DEV_ENTITLEMENTS_PATH,
      '--sign', '-',
      destinationApp,
    ])

    return {
      executable: brandedExecutable,
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
    }
  }
  catch (cause) {
    await rm(temporaryRoot, { recursive: true, force: true })
    throw cause
  }
}

/** Spawn one Electron process and resolve with its exit code, forwarding SIGINT/SIGTERM to it. */
function spawnAndWait(executable, argv) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(executable, argv, {
      stdio: 'inherit',
      env: process.env,
    })
    const forwardSignal = signal => { child.kill(signal) }
    const onInterrupt = () => { forwardSignal('SIGINT') }
    const onTerminate = () => { forwardSignal('SIGTERM') }
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onTerminate)
    const release = () => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
    }
    child.once('error', cause => {
      release()
      reject(cause)
    })
    child.once('exit', (code, signal) => {
      release()
      resolveExit(code ?? (signal === null ? 1 : 128))
    })
  })
}

/**
 * Spawn Electron, forward termination requests, and return its process status.
 *
 * A restart requested from inside the app (spec 032 live-install restart, or
 * the manual "Restart ACRYL" control) exits with `DEV_RESTART_EXIT_CODE`
 * instead of calling `app.relaunch()`: this function's own per-run temp
 * bundle is deleted as soon as the child exits (see `prepareDarwinDevelopmentBundle`),
 * so `app.relaunch()`'s own OS-level respawn would point at an
 * executable path we are about to delete out from under it - a dyld crash
 * ("Library not loaded: Electron Framework"), not a graceful restart. On
 * that exit code, stage a fresh bundle and spawn again instead of returning.
 *
 * `prepareBundle` and `spawnChild` default to the real darwin-bundling and
 * process-spawning implementations; tests inject fakes for the restart loop
 * without touching Electron, cp, or codesign.
 */
export async function launchDevelopmentElectron(argv = [], {
  importElectron = () => import('electron'),
  prepareBundle = prepareDarwinDevelopmentBundle,
  spawnChild = spawnAndWait,
} = {}) {
  const imported = await importElectron()
  if (typeof imported.default !== 'string') {
    throw new Error('launch-dev: electron package did not provide its executable path')
  }
  const mainPath = join(packageRoot, 'lib', 'main.js')

  for (;;) {
    const prepared = process.platform === 'darwin'
      ? await prepareBundle(imported.default)
      : { executable: imported.default, cleanup: async () => {} }
    let code
    try {
      code = await spawnChild(prepared.executable, [mainPath, ...argv])
    }
    finally {
      await prepared.cleanup()
    }
    if (code !== DEV_RESTART_EXIT_CODE) return code
  }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  void launchDevelopmentElectron(process.argv.slice(2)).then(
    code => { process.exitCode = code },
    cause => {
      process.stderr.write(`${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
      process.exitCode = 1
    },
  )
}
