import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { lintPackageDir } from './install.js'

const ARTIFACT_KINDS = ['plugins', 'extensions', 'adapters', 'skills', 'workflows', 'blueprints', 'stemcells']

/** Marketplace catalog requirements: exact keyword, GitHub repository, license, valid `acryl` manifest. */
export function checkCatalogMetadata(dir, fs = { existsSync, readFileSync }) {
  const errors = []
  let pkg
  try { pkg = JSON.parse(fs.readFileSync(join(dir, 'package.json'), 'utf8')) } catch { return { errors: ['package.json is missing or invalid'] } }
  if (pkg.private === true) errors.push('"private": true blocks publishing; remove it')
  if (typeof pkg.version !== 'string' || pkg.version === '') errors.push('package.json needs a "version"')
  if (typeof pkg.license !== 'string' || pkg.license === '') errors.push('package.json needs a "license"')
  if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes('acryl-package')) errors.push('"keywords" must include exactly "acryl-package" or the marketplace catalog will not list the package')
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (typeof repo !== 'string' || !/github\.com/u.test(repo)) errors.push('"repository" must point at a GitHub repository')
  const manifest = pkg.acryl
  if (manifest !== undefined) {
    if (manifest.schemaVersion !== 1) errors.push('"acryl.schemaVersion" must be 1')
    const artifacts = manifest.artifacts
    if (typeof artifacts !== 'object' || artifacts === null) errors.push('"acryl.artifacts" must be an object')
    else for (const [kind, paths] of Object.entries(artifacts)) {
      if (!ARTIFACT_KINDS.includes(kind)) errors.push(`unknown artifact kind "${kind}"`)
      else if (!Array.isArray(paths) || paths.some(p => typeof p !== 'string' || p.includes('..') || isAbsolute(p))) errors.push(`"acryl.artifacts.${kind}" must be relative paths without ".."`)
    }
  }
  return { name: pkg.name, version: pkg.version, errors }
}

function npmPackDryRun(dir) {
  return new Promise(resolve => {
    execFile('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, output: `${stdout}${stderr}`.trim().slice(-600) || String(error.message) })
      try { const [info] = JSON.parse(stdout); resolve({ ok: true, files: info.files?.length ?? 0, size: info.size }) } catch { resolve({ ok: false, output: 'npm pack produced unreadable output' }) }
    })
  })
}

/**
 * Prepare a local plugin for the marketplace WITHOUT publishing: install checks, catalog metadata and an
 * `npm pack --dry-run` (needs no credentials, uploads nothing). Publishing is a human step.
 */
export async function preparePublish(input, deps = {}) {
  const dir = input.path
  if (typeof dir !== 'string' || !isAbsolute(dir)) return { ok: false, errors: ['path must be the ABSOLUTE package directory'] }
  const lint = lintPackageDir(dir)
  const catalog = checkCatalogMetadata(dir)
  const errors = [...(lint.errors ?? []), ...catalog.errors]
  if (errors.length > 0) return { ok: false, errors, readyForHumanPublish: false }
  const pack = await (deps.pack ?? npmPackDryRun)(dir)
  if (!pack.ok) return { ok: false, errors: [`npm pack --dry-run failed: ${pack.output}`], readyForHumanPublish: false }
  return {
    ok: true, package: catalog.name, version: catalog.version, files: pack.files, readyForHumanPublish: true,
    next: `Tell the user the package is ready. Publishing is theirs to do (you cannot and must not publish): from ${dir} run \`npm publish --access public\` with their own npm login, then the marketplace lists it after its next catalog refresh.`,
  }
}
