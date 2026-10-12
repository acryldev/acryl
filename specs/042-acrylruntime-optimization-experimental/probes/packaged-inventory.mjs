#!/usr/bin/env node
// 042 dependency-cut probe, part 2: what a PACKAGED app ships, per package (the dev closure in dep-inventory.mjs lists every platform's native files at once).
//   node packaged-inventory.mjs /Applications/ACRYL.app/Contents/Resources/app.asar.unpacked/node_modules [--top 40] [--json out.json]
// Every directory that holds a package.json counts as one package; a nested node_modules is walked as its own packages, so nothing is counted twice. Read-only.
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const [root, ...rest] = process.argv.slice(2)
const arg = name => rest[rest.indexOf(name) + 1]
const top = Number(arg('--top') ?? 40) || 40

const packages = []
function ownSize(dir) {
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      const path = join(current, entry.name)
      try {
        const stat = lstatSync(path)
        if (stat.isDirectory()) stack.push(path)
        else if (stat.isFile()) total += stat.size
      } catch { /* vanished */ }
    }
  }
  return total
}
function walkModules(modulesDir) {
  let names
  try { names = readdirSync(modulesDir) } catch { return }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const dir = join(modulesDir, name)
    if (name.startsWith('@')) { walkModules(dir); continue }
    let manifest
    try { manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) } catch { continue }
    packages.push({ name: manifest.name ?? relative(root, dir), version: manifest.version ?? '?', dir: relative(root, dir), bytes: ownSize(dir) })
    walkModules(join(dir, 'node_modules'))
  }
}
walkModules(root)
packages.sort((a, b) => b.bytes - a.bytes)
const mb = bytes => (bytes / 1e6).toFixed(1).padStart(7)
const total = packages.reduce((sum, p) => sum + p.bytes, 0)
console.log(`packages: ${String(packages.length)}   total: ${mb(total).trim()} MB`)
for (const p of packages.slice(0, top)) console.log(`${mb(p.bytes)} MB  ${p.name}@${p.version}`)
const byScope = new Map()
for (const p of packages) {
  const scope = p.name.startsWith('@') ? p.name.split('/')[0] : '(unscoped)'
  byScope.set(scope, (byScope.get(scope) ?? 0) + p.bytes)
}
console.log('\nby scope')
for (const [scope, bytes] of [...byScope].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${mb(bytes)} MB  ${scope}`)
if (arg('--json') !== undefined) writeFileSync(arg('--json'), `${JSON.stringify(packages, null, 1)}\n`)
