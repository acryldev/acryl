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
