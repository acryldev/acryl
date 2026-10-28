#!/usr/bin/env node
/**
 * Fails the gate when the real ACRYL homes change while it runs: `check` must never write the developer's `~/.acryl`, `~/.acryl-dev`,
 * `~/.acryl-worktrees`, `~/.acryl-instances` (the running-app Registry and its locks) or `~/.dsh`.
 *
 *   node scripts/real-home-guard.mjs -- <command…>   record, run the command, verify, and exit with the command's code
 *
 * Vitest workers get a HOME of their own from `scripts/testing/isolate-home.ts`; this guard is the backstop for every other test runner
 * (`node --test`, the packaged and scaffolding gates) and for a future test that overrides HOME on purpose. A file added, removed, resized or
 * rewritten in a real home fails the gate with its path. Set `ACRYL_REAL_HOME_GUARD=off` only for a deliberate inspection of a home that an
 * installed app is actively using.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The real homes of the OS user, as `instance/` names them. */
const REAL_HOME_FOLDERS = ['.acryl', '.acryl-dev', '.acryl-worktrees', '.acryl-instances', '.dsh']

/** Every file under each real home as `path -> size:mtime:inode`, which changes on any write a test makes. */
function snapshot(osHome) {
  const entries = new Map()
  const walk = (path) => {
    let stats
    try {
      stats = lstatSync(path)
    } catch {
      return
    }
    if (stats.isDirectory()) {
      entries.set(path, 'dir')
      let names
      try {
        names = readdirSync(path)
      } catch {
        return
      }
      for (const name of names) walk(join(path, name))
      return
    }
    entries.set(path, `${String(stats.size)}:${String(stats.mtimeMs)}:${String(stats.ino)}`)
  }
  for (const folder of REAL_HOME_FOLDERS) {
    const path = join(osHome, folder)
    if (existsSync(path)) walk(path)
  }
  return entries
}

const argv = process.argv.slice(2)
const at = argv.indexOf('--')
if (at === -1 || at === argv.length - 1) {
  console.error('usage: real-home-guard.mjs -- <command…>')
  process.exit(2)
}
const command = argv.slice(at + 1)
if (process.env.ACRYL_REAL_HOME_GUARD === 'off') {
  const off = spawnSync(command[0], command.slice(1), { stdio: 'inherit' })
  process.exit(off.status ?? 1)
}

const osHome = homedir()
const report = join(osHome, '.cache', 'acryl-real-home-guard.json')
const before = snapshot(osHome)
try {
  writeFileSync(report, JSON.stringify({ at: new Date().toISOString(), folders: REAL_HOME_FOLDERS }, null, 2))
} catch {
  // The report is context for a developer, never a reason to fail.
}

const child = spawnSync(command[0], command.slice(1), { stdio: 'inherit' })
const after = snapshot(osHome)
const changed = []
for (const [path, state] of after) {
  const was = before.get(path)
  if (was === undefined) changed.push(`added   ${path}`)
  else if (was !== state) changed.push(`changed ${path}`)
}
for (const path of before.keys()) if (!after.has(path)) changed.push(`removed ${path}`)

if (changed.length > 0) {
  console.error(`real-home-guard: the gate wrote the OS user's real ACRYL homes (${REAL_HOME_FOLDERS.map(folder => `~/${folder}`).join(', ')}):`)
  for (const line of changed.slice(0, 40)) console.error(`  ${line}`)
  if (changed.length > 40) console.error(`  … and ${String(changed.length - 40)} more`)
  console.error('Isolate the test that wrote them (set HOME to a temp folder before it boots a composition root), then run the gate again.')
  process.exit(1)
}
process.exit(child.status ?? 1)
