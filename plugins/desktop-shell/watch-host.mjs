// The packaged host's watcher: what `node --watch --watch-path=...` did, restarting only when a watched file really changed.
//   <runtime> watch-host.mjs --watch-path=<file or folder> ... -- <node arguments> <script>
// `node --watch` restarts on every event the OS reports, and macOS reports a change of a file's access time: `git diff` on the app's source (the Changes
// panel, run as the host starts) moves the access time of every modified file, so a person's or an agent's uncommitted edit of blend.yaml or of a file in
// src/ restarted the host every few seconds without end (found on the ADE DMG, spec 051 T013). A file counts as changed here when it appears, disappears,
// or its size or modification time differs; access time never counts. Its lines are node --watch's own (`Restarting '<script>'`, `Failed running
// '<script>'`): the desktop reads `Failed running` as a crash (host-supervisor.ts hostCrashed).
import { spawn } from 'node:child_process'
import { readdirSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'

/** Folders under a watched folder that never restart the host. */
const SKIPPED = new Set(['node_modules', '.git'])

/** `size:mtime` of every file under `paths` (a file path stands for itself), by path; a missing path has no entry. */
export function snapshot(paths) {
  const files = new Map()
  const visit = (path) => {
    let stat
    try {
      stat = statSync(path)
    } catch {
      return
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) if (!SKIPPED.has(name)) visit(join(path, name))
    } else files.set(path, `${String(stat.size)}:${String(stat.mtimeMs)}`)
  }
  for (const path of paths) visit(path)
  return files
}

/** Whether two snapshots differ: a file added, removed, or with another size or modification time. */
export function changed(before, after) {
  if (before.size !== after.size) return true
  for (const [path, mark] of after) if (before.get(path) !== mark) return true
  return false
}

/** How long a burst of events (a save, a checkout, an agent's turn) is waited on before the files are compared. */
const SETTLE_MS = 200
/** How long a host is given to end on SIGTERM before it is killed, as node --watch waits for a graceful termination. */
const GRACE_MS = 5_000

function main(argv) {
  const split = argv.indexOf('--')
  if (split === -1)
    throw new Error(
      'watch-host: usage: watch-host.mjs --watch-path=<path> ... -- <node arguments> <script>',
    )
  const paths = argv
    .slice(0, split)
    .filter((arg) => arg.startsWith('--watch-path='))
    .map((arg) => arg.slice('--watch-path='.length))
  const command = argv.slice(split + 1)
  const script = command.at(-1)
  let files = snapshot(paths)
  let child
  let restarting = false
  const start = () => {
    child = spawn(process.execPath, command, { stdio: 'inherit', env: process.env })
    const current = child
    current.once('exit', (code) => {
      if (current !== child || restarting) return
      child = undefined
      if (code === 0)
        console.log(`Completed running '${script}'. Waiting for file changes before restarting...`)
      else console.log(`Failed running '${script}'. Waiting for file changes before restarting...`)
    })
  }
  const stopChild = () =>
    new Promise((done) => {
      const current = child
      if (current === undefined || current.exitCode !== null || current.signalCode !== null)
        return done()
      const timer = setTimeout(() => current.kill('SIGKILL'), GRACE_MS)
      current.once('exit', () => {
        clearTimeout(timer)
        done()
      })
      current.kill('SIGTERM')
    })
  let timer
  // One restart at a time: a burst that settles while a host is still stopping (up to GRACE_MS) is checked again after that restart, never in
  // parallel with it, which would start two hosts on one port.
  let busy = false
  let again = false
  const check = async () => {
    if (busy) {
      again = true
      return
    }
    busy = true
    try {
      do {
        again = false
        const next = snapshot(paths)
        if (!changed(files, next)) continue
        files = next
        restarting = true
        console.log(`Restarting '${script}'`)
        await stopChild()
        restarting = false
        start()
      } while (again)
    } finally {
      busy = false
    }
  }
  for (const path of paths) {
    let recursive
    try {
      recursive = statSync(path).isDirectory()
    } catch {
      continue
    }
    watch(path, { recursive }, () => {
      clearTimeout(timer)
      timer = setTimeout(() => void check(), SETTLE_MS)
    })
  }
  for (const name of ['SIGTERM', 'SIGINT'])
    process.once(name, () => {
      void stopChild().then(() => process.exit(0))
    })
  start()
}

// Run as a script (the packaged host's runtime is Electron as Node 24, which has import.meta.main); imported by its test, it only exports.
if (import.meta.main) main(process.argv.slice(2))
