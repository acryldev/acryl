#!/usr/bin/env node
// Release gate: pack the two packages and check what would be published.
//
//   node scripts/verify-tarball.mjs [tarball...]      (no argument: pack packages/cli and packages/create into a scratch folder first)
//
// 1. The name of the upstream project the framework core was ported from appears nowhere in a packed file or path (a case-insensitive substring match; only the whole English words honor, honour and their forms are allowed: see scripts/lib/name-gate.mjs), except in a LICENSE file. The
//    English words that contain it (honor, honour and their forms) are not hits. The name is built from character codes so this file does not carry it either.
// 2. No test file of a vendored plugin is shipped (`*.test.*`, `*.spec.*`, `*.case.ts`, a `test` or `tests` folder under `plugins/`): apps never receive them.
// Prints each package's packed and unpacked size and file count.
import './lib/scratch-home.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { findName } from './lib/name-gate.mjs'

const root = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-tarball-'))
const problems = []

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

let tarballs = process.argv.slice(2).map((path) => resolve(path))
if (tarballs.length === 0) {
  const out = join(scratch, 'packed')
  tarballs = ['cli', 'create'].map((dir) => {
    const listing = execFileSync('pnpm', ['pack', '--pack-destination', out], {
      cwd: join(root, 'packages', dir),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return listing.trim().split('\n').at(-1).trim().startsWith('/')
      ? listing.trim().split('\n').at(-1).trim()
      : join(
          out,
          readdirSync(out).find((f) => f.startsWith(dir === 'cli' ? 'acrylblends-' : 'create-')),
        )
  })
}

for (const tarball of tarballs) {
  const into = mkdtempSync(join(scratch, 'x-'))
  execFileSync('tar', ['-xzf', tarball, '-C', into])
  const files = walk(join(into, 'package'))
  let unpacked = 0
  for (const file of files) {
    const inside = file.slice(join(into, 'package').length + 1)
    unpacked += statSync(file).size
    if (findName(inside).length > 0)
      problems.push(`${tarball.split('/').at(-1)}: the path ${inside} names the upstream project`)
    if (/(^|\/)LICENSE(\.md)?$/.test(inside)) continue
    const bytes = readFileSync(file)
    if (bytes.includes(0)) continue
    const lines = bytes.toString('utf8').split('\n')
    lines.forEach((line, index) => {
      if (findName(line).length > 0)
        problems.push(
          `${tarball.split('/').at(-1)}: ${inside}:${index + 1}: ${line.trim().slice(0, 120)}`,
        )
    })
    if (/^plugins\//.test(inside) && /(\.test\.|\.spec\.|\.case\.ts$|\/tests?\/)/.test(inside))
      problems.push(`${tarball.split('/').at(-1)}: ${inside} is a test file of a vendored plugin`)
  }
  // A declaration file beside the TypeScript source it describes is build debris (the vendored plugins ship as .ts): 1.0.5 carried 95 of them in plugins/acryl-router/src, which every new app received.
  const inPackage = new Set(files.map((file) => file.slice(join(into, 'package').length + 1)))
  for (const inside of inPackage)
    if (
      /^plugins\//.test(inside) &&
      inside.endsWith('.d.ts') &&
      inPackage.has(`${inside.slice(0, -5)}.ts`)
    )
      problems.push(
        `${tarball.split('/').at(-1)}: ${inside} is a stray declaration file beside its source`,
      )
  console.log(
    `verify-tarball: ${tarball.split('/').at(-1)}: ${statSync(tarball).size} bytes packed, ${unpacked} unpacked, ${files.length} files`,
  )
}
rmSync(scratch, { recursive: true, force: true })
if (problems.length > 0) {
  for (const problem of problems.slice(0, 40)) console.error(`verify-tarball: ${problem}`)
  if (problems.length > 40) console.error(`verify-tarball: ... and ${problems.length - 40} more`)
  process.exit(1)
}
console.log(
  'verify-tarball: the upstream name appears nowhere (LICENSE files excepted) and no vendored plugin test file is shipped',
)
