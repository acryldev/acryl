// D6: the run-time pruning applied to a payload or an unpacked Electron node_modules, so both are compared the same way.
// node d6-prune.mjs <node_modules dir> [--drop pkg1,pkg2,...]
//  - removes other-platform natives (scripts/prune-target-native.mjs rules, for this machine's platform/arch)
//  - removes type declarations (*.d.ts/.d.mts/.d.cts) and markdown outside acryl*/@deepseek-ai/*/@acryl (ACRYL reads its own docs at run time)
//  - removes the optional --drop packages (paths relative to node_modules)
import { readdirSync, rmSync, statSync, lstatSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const { shouldRemoveNativePath } = await import(pathToFileURL(join(repo, 'scripts/prune-target-native.mjs')).href)
const root = resolve(process.argv[2])
const drop = (process.argv.includes('--drop') ? process.argv[process.argv.indexOf('--drop') + 1].split(',') : [])
const sizeOf = (p) => { let t = 0; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isSymbolicLink()) continue; e.isDirectory() ? walk(f) : (t += statSync(f).size) } }; walk(p); return t }
const before = sizeOf(root)
const keepMd = (rel) => { const [a, b] = rel.split(sep); const top = a?.startsWith('@') ? `${a}/${b}` : a; return top?.startsWith('acryl') || top?.startsWith('@deepseek-ai/') || top?.startsWith('@acryl') }
const removed = { native: 0, types: 0, md: 0, drop: 0 }
for (const d of drop) { const p = join(root, d); try { removed.drop += sizeOf(p); rmSync(p, { recursive: true, force: true }) } catch {} }
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name); const rel = relative(root, p)
    if (e.isSymbolicLink()) continue
    if (shouldRemoveNativePath(rel, process.env.D6_PLATFORM ?? process.platform, process.env.D6_ARCH ?? process.arch)) { removed.native += e.isDirectory() ? sizeOf(p) : lstatSync(p).size; rmSync(p, { recursive: true, force: true }); continue }
    if (e.isDirectory()) { walk(p); continue }
    if (/\.d\.(ts|mts|cts)$/u.test(e.name)) { removed.types += lstatSync(p).size; rmSync(p) }
    else if (/\.md$/iu.test(e.name) && !keepMd(rel)) { removed.md += lstatSync(p).size; rmSync(p) }
  }
}
walk(root)
const mb = (n) => (n / 1048576).toFixed(1)
console.log(`${mb(before)} MB -> ${mb(sizeOf(root))} MB   removed: other-platform natives ${mb(removed.native)}, type declarations ${mb(removed.types)}, markdown ${mb(removed.md)}, dropped packs ${mb(removed.drop)}`)
