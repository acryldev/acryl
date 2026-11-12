import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { targetForNode, targetPackageName, validatePayloadReceipt, validateReceipt } from './release-contract.js'

export const targetFor = targetForNode
export { targetPackageName }

function installedManifest(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error('runtime package metadata is invalid') }
}

/** Resolve and validate the installed, exact-version target runtime before executing it. */
export function runtimeLauncher({ require = createRequire(import.meta.url), platform = process.platform, arch = process.arch, version } = {}) {
  const target = targetForNode({ platform, arch })
  const packageName = targetPackageName(target)
  let root
  try { root = dirname(require.resolve(`${packageName}/package.json`)) } catch {
    throw new Error(`ACRYL CLI runtime ${packageName} is missing. Reinstall with: npm install -g acryl --include=optional`)
  }
  const manifest = installedManifest(join(root, 'package.json'))
  const selectorVersion = version ?? JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  if (manifest.name !== packageName || manifest.version !== selectorVersion) {
    throw new Error(`ACRYL CLI runtime ${packageName} does not match selector version ${selectorVersion}. Reinstall with: npm install -g acryl --include=optional`)
  }
  let receipt
  try { receipt = JSON.parse(readFileSync(join(root, 'runtime', 'receipt.json'), 'utf8')) } catch {
    throw new Error(`ACRYL CLI runtime ${packageName} has no valid receipt. Reinstall with: npm install -g acryl --include=optional`)
  }
  try {
    validateReceipt(receipt, { target, version: selectorVersion, packageName })
    validatePayloadReceipt(receipt, join(root, 'runtime'))
  } catch (cause) {
    throw new Error(`ACRYL CLI runtime ${packageName} receipt validation failed: ${cause.message}. Reinstall with: npm install -g acryl --include=optional`)
  }
  return join(root, 'runtime', 'bin', platform === 'win32' ? 'acryl.cmd' : 'acryl')
}

/**
 * How to start the CLI runtime whose launcher `runtimeLauncher` returned. Elsewhere that is the launcher itself. On Windows the launcher is a
 * `.cmd`, which Node starts only through cmd.exe (CVE-2024-27980), where the user's arguments would be parsed again (`%`, `^`, `"`) and Ctrl-C
 * asks "Terminate batch job (Y/N)?". So what the `.cmd` runs (apps/acryl-cli/scripts/acryl-cli-launcher.cmd) is run directly: this Node, with
 * --expose-internals, on the runtime's lib/bin.js.
 * @returns {{ command: string, args: string[] }}
 */
export function runtimeCommand(launcher, args, { platform = process.platform, node = process.execPath } = {}) {
  if (platform !== 'win32') return { command: launcher, args }
  return { command: node, args: ['--expose-internals', join(dirname(dirname(launcher)), 'lib', 'bin.js'), ...args] }
}

export const STOP_SIGNALS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP'])

/**
 * Pass the stop signals this process receives on to the runtime it started, and stay alive until that runtime exits. A supervisor or `kill`
 * signals this process alone, and the runtime (the Web server, holding its port) outlived it. A terminal's Ctrl-C reaches both, so the runtime
 * gets it twice and must take a repeated signal calmly (apps/acryl-web/src/serve.ts does). On Windows nothing is passed on: the console sends
 * Ctrl-C to both processes itself, Node can only end a child there, not signal it, and the child is in a job that ends with this process.
 * @returns {() => void} removes the handlers
 */
export function forwardStopSignals(child, { platform = process.platform, host = process } = {}) {
  const forward = signal => {
    if (platform !== 'win32' && child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
  for (const signal of STOP_SIGNALS) host.on(signal, forward)
  return () => { for (const signal of STOP_SIGNALS) host.off(signal, forward) }
}
