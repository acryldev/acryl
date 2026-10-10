import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const root = process.argv[2]
const groups = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory())
const errors = new Map()
let ok = 0, total = 0
for (const g of groups) {
  const pkgs = existsSync(join(root, g.name, 'package.json')) ? [join(root, g.name)] : readdirSync(join(root, g.name), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(root, g.name, d.name))
  for (const dir of pkgs) {
    const entry = join(dir, 'lib', 'index.js')
    if (!existsSync(entry)) continue
    total++
    try { await import(pathToFileURL(entry).href); ok++ } catch (e) {
      const msg = String(e?.message ?? e).split('\n')[0].slice(0, 160)
      errors.set(msg, [...(errors.get(msg) ?? []), dir.replace(root + '/', '')])
    }
  }
}
console.log(`imported ${ok}/${total}`)
for (const [m, list] of errors) console.log(`\n${m}\n   ${list.length}: ${list.slice(0, 6).join(', ')}`)
process.exit(0)
