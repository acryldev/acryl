import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const TARGETS = new Map([
  ['darwin/arm64', 'darwin-arm64'],
  ['darwin/x64', 'darwin-x64'],
  ['linux/arm64', 'linux-arm64'],
  ['linux/x64', 'linux-x64'],
  ['win32/x64', 'windows-x64'],
])

export function targetFor({ platform, arch }) {
  const target = TARGETS.get(`${platform}/${arch}`)
  if (target === undefined) throw new Error(`unsupported ACRYL target: ${platform}/${arch}`)
  return target
}

export function targetPackageName(target) {
  return `acryl-cli-${target}`
}

export function runtimeLauncher({ require = createRequire(import.meta.url), platform = process.platform, arch = process.arch } = {}) {
  const target = targetFor({ platform, arch })
  const packageName = targetPackageName(target)
  try {
    return join(dirname(require.resolve(`${packageName}/package.json`)), 'runtime', 'bin', platform === 'win32' ? 'acryl.cmd' : 'acryl')
  } catch {
    throw new Error(`ACRYL CLI runtime ${packageName} is missing. Reinstall with: npm install -g acryl --include=optional`)
  }
}
