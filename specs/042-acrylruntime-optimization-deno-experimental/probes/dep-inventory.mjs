#!/usr/bin/env node
// 042 dependency-cut probe, part 1: what the Desktop's production dependency closure weighs on disk, per package.
//   corepack pnpm --filter acryl-desktop list --prod --depth Infinity --json > deps.json
//   node specs/042-.../probes/dep-inventory.mjs deps.json [--top 40]
// Sizes are the bytes of each package's own files (nested node_modules are separate packages in the closure and are not counted twice). Workspace packages
// (ACRYL's own) are counted from `lib/` plus package.json, which is what ships. Read-only: it only reads files.
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

const [file, ...rest] = process.argv.slice(2)
const top = Number(rest[rest.indexOf('--top') + 1] ?? 40) || 40
const roots = JSON.parse(readFileSync(file, 'utf8'))

const seen = new Map()
const walkTree = deps => {
  for (const [name, dep] of Object.entries(deps ?? {})) {
    const key = `${name}@${dep.version}`
    if (!seen.has(key)) seen.set(key, { name, version: dep.version, path: dep.path })
    walkTree(dep.dependencies)
  }
}
for (const root of roots) walkTree(root.dependencies)

function size(dir, { only } = {}) {
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try { entries = readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue
      const path = join(current, entry.name)
      if (only !== undefined && current === dir && !only.includes(entry.name)) continue
      try {
        const stat = lstatSync(path)
        if (stat.isDirectory()) stack.push(path)
        else if (stat.isFile()) total += stat.size
      } catch { /* vanished */ }
    }
  }
  return total
}

const rows = []
for (const dep of seen.values()) {
  if (dep.path === undefined) continue
  const workspace = !dep.path.includes(`${sep}node_modules${sep}`)
  rows.push({ ...dep, workspace, bytes: size(dep.path, workspace ? { only: ['lib', 'package.json'] } : undefined) })
}
rows.sort((a, b) => b.bytes - a.bytes)
const mb = bytes => (bytes / 1e6).toFixed(1).padStart(7)
const total = rows.reduce((sum, row) => sum + row.bytes, 0)
console.log(`packages: ${String(rows.length)}   total: ${mb(total).trim()} MB   (ACRYL workspace packages: ${mb(rows.filter(r => r.workspace).reduce((s, r) => s + r.bytes, 0)).trim()} MB)`)
console.log('\nlargest packages')
for (const row of rows.slice(0, top)) console.log(`${mb(row.bytes)} MB  ${row.name}@${row.version}${row.workspace ? '  [workspace]' : ''}`)
const byScope = new Map()
for (const row of rows) {
  const scope = row.name.startsWith('@') ? row.name.split('/')[0] : '(unscoped)'
  byScope.set(scope, (byScope.get(scope) ?? 0) + row.bytes)
}
console.log('\nby scope')
for (const [scope, bytes] of [...byScope].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${mb(bytes)} MB  ${scope}`)
