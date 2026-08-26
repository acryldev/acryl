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
    await execFileAsync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', destinationApp])

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

/** Spawn Electron, forward termination requests, and return its process status. */
export async function launchDevelopmentElectron(argv = []) {
  const imported = await import('electron')
  if (typeof imported.default !== 'string') {
    throw new Error('launch-dev: electron package did not provide its executable path')
  }
  const prepared = process.platform === 'darwin'
    ? await prepareDarwinDevelopmentBundle(imported.default)
    : { executable: imported.default, cleanup: async () => {} }
  const mainPath = join(packageRoot, 'lib', 'main.js')

  try {
    return await new Promise((resolveExit, reject) => {
      const child = spawn(prepared.executable, [mainPath, ...argv], {
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
  finally {
    await prepared.cleanup()
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
