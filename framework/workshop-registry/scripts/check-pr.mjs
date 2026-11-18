#!/usr/bin/env node
// What a pull request may change in the workshop registry, decided from the list of changed files and the pull request's files read as data (nothing in them is run).
//   node scripts/check-pr.mjs --login <author> --changed <file: status<TAB>path[<TAB>previous path] per line> --pr <checkout of the pull request> [--out <problems file>]
// Rules: every change is inside ONE folder blends/<login>.<name>/, where <login> is the author's GitHub login (so nobody can change another's entry, the index, a script or a
// workflow), nothing is renamed in or out of it, and the folder in the pull request holds no link. What an entry must be (valid blend.yaml, a sound app, no key, the size limits)
// is checked next by scripts/registry-index.ts --only <id>. Exit 0 prints the folder name (the entry id); exit 1 prints every problem.
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    login: { type: 'string' },
    changed: { type: 'string' },
    pr: { type: 'string' },
    out: { type: 'string' },
  },
})
if (!values.login || !values.changed || !values.pr) {
  console.error(
    'usage: check-pr.mjs --login <author> --changed <file> --pr <folder> [--out <file>]',
  )
  process.exit(2)
}
const login = values.login.toLowerCase()
const problems = []
/** One line per kind of problem, not per file: a pull request that adds a whole app in the wrong folder says so once. */
const seen = new Set()
const refuse = (key, message) => {
  if (seen.has(key)) return
  seen.add(key)
  problems.push(message)
}
const rows = readFileSync(values.changed, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, path, previous] = line.split('\t')
    return { status, path, previous: previous || undefined }
  })
if (rows.length === 0) problems.push('the pull request changes nothing')
if (rows.length > 1500)
  problems.push(`the pull request changes ${rows.length} files; the limit is 1500`)

const ENTRY = /^blends\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\/(.+)$/u
const folders = new Set()
for (const { status, path, previous } of rows) {
  if (path.split('/').includes('..') || path.includes('\\') || path.startsWith('/')) {
    refuse(`escape:${path}`, `${path}: a path that leaves its folder`)
    continue
  }
  const match = ENTRY.exec(path)
  if (!match) {
    refuse(
      `outside:${path}`,
      `${path}: a pull request may change only blends/${login}.<name>/ (this file is outside it)`,
    )
    continue
  }
  const [, folder] = match
  folders.add(folder)
  if (folder.split('.')[0] !== login)
    refuse(
      `owner:${folder}`,
      `blends/${folder}/: the folder belongs to "${folder.split('.')[0]}", and this pull request is from ${values.login}; an entry is named ${login}.<name> (first file: ${path})`,
    )
  if (status === 'renamed' || previous !== undefined) {
    const from = ENTRY.exec(previous ?? '')
    if (!from || from[1] !== folder)
      refuse(
        `move:${folder}`,
        `${path}: moved here from ${previous}; a file may not move between folders`,
      )
  }
}
if (folders.size > 1)
  problems.push(
    `the pull request touches ${folders.size} entries (${[...folders].join(', ')}); one entry per pull request`,
  )

// A link in the entry as the pull request has it (read as data): refused before anything reads the folder.
const [id] = folders
if (problems.length === 0 && id !== undefined) {
  const base = join(values.pr, 'blends', id)
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      return // the entry was removed: nothing to read
    }
    for (const name of names) {
      const path = join(dir, name)
      const info = lstatSync(path)
      if (info.isSymbolicLink())
        refuse(`link:${path}`, `${path.slice(values.pr.length + 1)}: a link; links are not allowed`)
      else if (info.isDirectory()) walk(path)
    }
  }
  walk(base)
}

const shown = problems.slice(0, 20)
if (problems.length > shown.length) shown.push(`... and ${problems.length - shown.length} more`)
if (values.out) writeFileSync(values.out, shown.map((problem) => `- ${problem}`).join('\n'))
if (problems.length > 0) {
  for (const problem of shown) console.log(`refused ${problem}`)
  process.exit(1)
}
console.log(id)
