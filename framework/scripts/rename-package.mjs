#!/usr/bin/env node
// Rename the framework package in the docs after `scripts/lib/names.mjs` changed its name.
//
//   node scripts/rename-package.mjs <from> <to> [docs folder]
//
// It rewrites every whole-word use of the old name in the markdown under docs/framework (or the given folder), including the `create-<name>` form, and prints what it changed.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [from, to, folder] = process.argv.slice(2)
if (!from || !to) {
  console.error('usage: node scripts/rename-package.mjs <from> <to> [docs folder]')
  process.exit(2)
}
const root = folder
  ? resolve(folder)
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'framework')
const pages = (dir) =>
  readdirSync(dir).flatMap((name) =>
    statSync(join(dir, name)).isDirectory()
      ? pages(join(dir, name))
      : name.endsWith('.md')
        ? [join(dir, name)]
        : [],
  )
const word = new RegExp(`(?<![A-Za-z0-9-])(create-)?${from}(?![A-Za-z0-9-])`, 'g')
let changed = 0
for (const page of pages(root)) {
  const before = readFileSync(page, 'utf8')
  const after = before.replace(word, (_m, create) => `${create ?? ''}${to}`)
  if (after !== before) {
    writeFileSync(page, after)
    changed++
  }
}
console.log(`renamed ${from} to ${to} in ${changed} pages under ${root}`)
