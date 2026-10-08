// D6: size the real run-time payload of the web surface, minus the bundled Node.
// build-web-archive.mjs runs `pnpm deploy --prod`, flatten, prune. `pnpm deploy` here resolves but installs nothing (it needs the
// global pnpm store, which this sandbox cannot write), so the same production closure is walked from the existing install instead:
// acryl-web's dependencies + optionalDependencies + peerDependencies (pnpm installs peers), recursively, each package copied once to node_modules/<name> (first version wins,
// exactly flattenNodeModules' rule), then the project's own pruneTargetNative + pruneReleasePayload.
// Run from the repository root: node specs/042-acrylruntime-optimization-deno-experimental/probes/d6-payload.mjs [outDir]
// Writes only under outDir (default: a fresh temp dir, printed); nothing in the repo or any ACRYL home changes.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const scripts = (name) => import(pathToFileURL(join(root, 'scripts', name)).href)
const { pruneTargetNative } = await scripts('prune-target-native.mjs')
const { pruneReleasePayload } = await scripts('prune-release-payload.mjs')

const out = process.argv[2] ? resolve(process.argv[2]) : join(mkdtempSync(join(tmpdir(), 'd6-payload-')), 'acryl-web')
const sizeOf = (dir) => {
  let total = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) continue
    total += e.isDirectory() ? sizeOf(p) : statSync(p).size
  }
  return total
}
const mb = (n) => (n / 1048576).toFixed(1).padStart(7) + ' MB'
const app = join(root, 'apps/acryl-web')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'node_modules'), { recursive: true })
cpSync(join(app, 'lib'), join(out, 'lib'), { recursive: true })
cpSync(join(app, 'package.json'), join(out, 'package.json'))

const seen = new Map() // real dir -> true
const placed = new Set() // package names already placed
const queue = [{ name: null, dir: app }]
let missing = []
while (queue.length) {
  const { dir } = queue.shift()
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })) {
    let manifestPath
    try { manifestPath = findPackageJSON(dep, pathToFileURL(join(dir, 'package.json')).href) } catch { manifestPath = undefined }
    if (manifestPath === undefined) { if (!(manifest.optionalDependencies ?? {})[dep] && !(manifest.peerDependenciesMeta?.[dep]?.optional)) missing.push(`${dep} (from ${manifest.name})`); continue }
    const real = realpathSync(dirname(manifestPath))
    if (seen.has(real)) continue
    seen.set(real, true)
    queue.push({ name: dep, dir: real })
    if (placed.has(dep)) continue
    placed.add(dep)
    cpSync(real, join(out, 'node_modules', dep), {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|\.git)$/u.test(src) || src === real, // packages whole; only a workspace package's own node_modules (symlinks) and .git are skipped - pruneReleasePayload decides the rest
    })
  }
}
console.log(`closure: ${seen.size} package directories, ${placed.size} distinct names; not resolvable (non-optional): ${missing.length}`)
if (missing.length) console.log('  ' + missing.slice(0, 8).join('\n  '))
console.log('closure copied            ', mb(sizeOf(out)))
pruneTargetNative(out, process.platform, process.arch)
console.log('after prune native        ', mb(sizeOf(out)))
pruneReleasePayload(out)
console.log('FINAL (after prune payload)', mb(sizeOf(out)))

const top = (dir) => readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => [e.name, sizeOf(join(dir, e.name))])
const scoped = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() && e.name.startsWith('@') ? top(join(dir, e.name)).map(([n, b]) => [`${e.name}/${n}`, b]) : e.isDirectory() ? [[e.name, sizeOf(join(dir, e.name))]] : [])
console.log('\nlargest packages:')
for (const [name, bytes] of scoped(join(out, 'node_modules')).sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`  ${mb(bytes)}  ${name}`)
console.log('\npayload dir:', out)
