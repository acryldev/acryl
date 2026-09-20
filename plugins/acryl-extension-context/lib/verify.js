import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lintPackageDir } from './install.js'

let importCounter = 0
const DOCS = {
  shape: ['extending.service', 'start.verify-before-done'],
  packaging: ['extending.packaging'],
  client: ['extending.client-slot'],
}

/**
 * Verify a plugin package WITHOUT installing it: install lint, then import the host entry and check the
 * Cordis plugin shape (the real underlying error text is reported, never swallowed). Every finding names the
 * pack docs that explain the fix. A package that throws at import never crashes the verifier.
 */
export async function verifyPackage(input, fs = { existsSync, readFileSync }) {
  const dir = input.path
  const findings = []
  const lint = lintPackageDir(dir, fs)
  for (const message of lint.errors ?? []) {
    findings.push({ severity: 'error', code: /exports/u.test(message) ? 'package-json-not-exported' : /bundle patch|"dsh"/u.test(message) ? 'bundle-patch-missing' : 'invalid-package', message, docs: DOCS.packaging })
  }
  if (lint.name === undefined) return report(dir, findings)

  const pkg = JSON.parse(fs.readFileSync(join(dir, 'package.json'), 'utf8'))
  const entryRel = typeof pkg.exports?.['.'] === 'string' ? pkg.exports['.'] : typeof pkg.main === 'string' ? pkg.main : './index.js'
  const entry = join(dir, entryRel)
  if (!fs.existsSync(entry)) {
    findings.push({ severity: 'error', code: 'import-failed', message: `the host entry ${entryRel} does not exist`, docs: DOCS.packaging })
    return report(dir, findings)
  }
  // A UI-only plugin ships an empty host apply; it still must import.
  let mod
  try { mod = await import(`${pathToFileURL(entry).href}?verify=${++importCounter}-${Date.now()}`) } catch (cause) {
    // Declared dependencies are not installed in the source folder until the plugin is installed into the
    // profile, so a missing declared package is expected here: the shape cannot be checked yet, not an error.
    const missing = cause?.code === 'ERR_MODULE_NOT_FOUND' ? /Cannot find package '([^']+)'/u.exec(String(cause.message))?.[1] : undefined
    if (missing && (pkg.dependencies?.[missing] || pkg.peerDependencies?.[missing])) {
      findings.push({ severity: 'warning', code: 'dependency-not-installed-yet', message: `the entry imports "${missing}", which is declared but only resolvable after install; the plugin shape was NOT checked. Install it, then read the plugin status in the result.`, docs: DOCS.packaging })
      return report(dir, findings)
    }
    findings.push({ severity: 'error', code: 'import-failed', message: `importing ${entryRel} failed: ${cause instanceof Error ? cause.stack ?? cause.message : cause}`, docs: DOCS.shape })
    return report(dir, findings)
  }
  const hasDefault = 'default' in mod
  const named = ['name', 'inject', 'apply', 'Config'].filter(key => key in mod)
  if (hasDefault && named.length > 0) {
    findings.push({ severity: 'error', code: 'default-with-named-metadata', message: `the entry has a default export AND named exports (${named.join(', ')}); the loader keeps only the default, so the named metadata (name, inject, Config) is silently dropped. Use named exports only.`, docs: DOCS.shape })
  }
  const plugin = hasDefault ? mod.default : mod
  const apply = typeof plugin === 'function' ? plugin : plugin?.apply
  if (typeof apply !== 'function') {
    findings.push({ severity: 'error', code: 'invalid-plugin-shape', message: 'the entry must export an "apply(ctx)" function (named export), or a default function', docs: DOCS.shape })
  }
  if (plugin?.inject !== undefined && !(Array.isArray(plugin.inject) || (typeof plugin.inject === 'object' && plugin.inject !== null))) {
    findings.push({ severity: 'error', code: 'invalid-plugin-shape', message: '"inject" must be an array of service names (or { required, optional })', docs: DOCS.shape })
  }
  if (plugin?.name !== undefined && typeof plugin.name !== 'string') {
    findings.push({ severity: 'error', code: 'invalid-plugin-shape', message: '"name" must be a string', docs: DOCS.shape })
  }
  if (lint.hasClient) {
    const clientPath = typeof pkg.exports?.['./client'] === 'string' ? join(dir, pkg.exports['./client']) : undefined
    const source = clientPath && fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : ''
    if (source && !/__ModuleLoader__/u.test(source)) {
      findings.push({ severity: 'warning', code: 'client-loader-wrapper-missing', message: 'the client bundle does not reference window.__ModuleLoader__; it will not register in the browser unless it is wrapped as the example shows', docs: DOCS.client })
    }
  }
  return report(dir, findings)
}

function report(dir, findings) {
  const docs = [...new Set(findings.flatMap(f => f.docs ?? []))]
  return { ok: findings.every(f => f.severity !== 'error'), target: dir, findings, docs }
}
