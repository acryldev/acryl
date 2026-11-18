#!/usr/bin/env node
// Stage ACRYL's PREBUILT packages (its lib/ folders, as `pnpm build` made them in the ACRYL checkout) so `dsh plugin add file:...` can install them:
// every `workspace:*` dependency becomes a `file:` path to a sibling copy (or goes), and `acrylblends` is dropped from their dependencies so the profile keeps ONE copy of the framework
// (the ACRYL packages ask for ^0.9.2, which would install a second router beside the 1.1.0 the app uses).
//   node stage-acryl.mjs <ACRYL checkout> <out folder>
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const [checkout, out] = process.argv.slice(2)
if (!checkout || !out) throw new Error('usage: node stage-acryl.mjs <ACRYL checkout> <out folder>')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const sources = new Map()
for (const group of ['plugins', 'runtime'])
  for (const name of readdirSync(join(checkout, group))) {
    const file = join(checkout, group, name, 'package.json')
    if (existsSync(file))
      sources.set(JSON.parse(readFileSync(file, 'utf8')).name, join(checkout, group, name))
  }
const safe = (name) => name.replace('/', '__').replace('@', '')
const order = []
const seen = new Set()
const need = (name) => {
  if (seen.has(name) || !sources.has(name)) return
  seen.add(name)
  const manifest = JSON.parse(readFileSync(join(sources.get(name), 'package.json'), 'utf8'))
  for (const field of ['dependencies', 'peerDependencies'])
    for (const [dependency, range] of Object.entries(manifest[field] ?? {}))
      if (range.startsWith('workspace:')) need(dependency)
  order.push(name)
}
for (const name of [
  'acryl-workspace',
  'acryl-app-shell',
  '@acryl/ui',
  'acryl-settings',
  'acryl-control',
  'acryl-loopback-http',
])
  need(name)
for (const name of order) {
  const from = sources.get(name)
  const to = join(out, safe(name))
  const manifest = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'))
  for (const entry of manifest.files ?? ['lib']) {
    const item = entry.replace('/**', '')
    if (!existsSync(join(from, item))) continue
    mkdirSync(dirname(join(to, item)), { recursive: true })
    cpSync(join(from, item), join(to, item), {
      recursive: true,
      filter: (path) => !/\.map$|node_modules/u.test(path),
    })
  }
  for (const extra of ['cordis.patch.yml', 'LICENSE'])
    if (existsSync(join(from, extra)) && !existsSync(join(to, extra)))
      cpSync(join(from, extra), join(to, extra))
  for (const field of [
    'dependencies',
    'peerDependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    const group = manifest[field]
    if (group === undefined) continue
    for (const [dependency, range] of Object.entries(group)) {
      if (dependency === 'acrylblends') delete group[dependency]
      else if (range.startsWith('workspace:')) {
        if (field === 'dependencies' && order.includes(dependency))
          group[dependency] = `file:../${safe(dependency)}`
        else delete group[dependency]
      }
    }
    if (Object.keys(group).length === 0) delete manifest[field]
  }
  delete manifest.scripts
  writeFileSync(join(to, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
console.log(`staged ${order.length} packages in ${out}: ${order.join(', ')}`)
