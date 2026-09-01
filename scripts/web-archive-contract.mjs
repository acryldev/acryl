import { RECEIPT_SCHEMA_VERSION } from './release-contract.mjs'

const TARGETS = {
  'darwin-arm64': { nodePlatform: 'darwin', nodeArch: 'arm64', windows: false },
  'darwin-x64': { nodePlatform: 'darwin', nodeArch: 'x64', windows: false },
  'linux-arm64': { nodePlatform: 'linux', nodeArch: 'arm64', windows: false },
  'linux-x64': { nodePlatform: 'linux', nodeArch: 'x64', windows: false },
  'windows-x64': { nodePlatform: 'win', nodeArch: 'x64', windows: true },
}

export function nodeDistribution(target, version) {
  const spec = webTarget(target)
  return {
    basename: `node-v${version}-${spec.nodePlatform}-${spec.nodeArch}`,
    extension: spec.windows ? 'zip' : 'tar.gz',
  }
}

export function webTarget(target) {
  const result = TARGETS[target]
  if (result === undefined) throw new Error(`unsupported Web target ${target}; supported: ${Object.keys(TARGETS).join(', ')}`)
  return result
}

/** Native binaries a Web target archive may legitimately embed in node_modules. */
export function webNativeAllowlist(spec) {
  const platform = spec.windows ? 'win32' : spec.nodePlatform
  const arch = spec.nodeArch
  const patterns = [
    `node_modules/**/*${platform}-${arch}*`,
    `node_modules/**/*${platform}-${arch}*/**`,
  ]
  if (spec.windows) {
    // node-pty nests its Windows ConPTY runtime under build/Release and a
    // win10-<arch> vendor tree; these are the target's own native binaries.
    patterns.push(
      `node_modules/*node-pty*/build/Release/conpty/**`,
      `node_modules/**/*node-pty*/build/Release/conpty/**`,
      `node_modules/**/*win10-${arch}*`,
      `node_modules/**/*win10-${arch}*/**`,
      `runtime/bin/node.exe`,
    )
  }
  return patterns
}

/** Create a Web receipt with the shared release schema and integrity form. */
export function artifactReceipt({ version, target, archive, sha256 }) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    surface: 'web', target, version,
    capabilityBaseline: 'acryl-capability-baseline-v1',
    location: archive,
    integrity: { algorithm: 'sha256', value: sha256 },
  }
}
