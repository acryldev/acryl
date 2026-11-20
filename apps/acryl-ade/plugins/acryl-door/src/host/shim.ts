/**
 * The app folder's own command (spec 049 slice 10): `<app>/.acryl/bin/acryl` (and `acryl.cmd` on Windows) runs this door's operator
 * client against this folder only (`--dir <app>`), with the Node that runs the app. An agent working in the folder calls it by that path,
 * so it reaches the app running from this folder and never a user's own `acryl` on PATH or another app's door.
 *
 * Written each time the door starts, so a moved app or a new Node is picked up. It stays when the app stops: run then, it says that no
 * app is running in the folder (exit 3). It carries no secret; the client reads `door.json` at each call.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureStateDir } from './door-file.ts'

/** The folder of the command below the app folder's `.acryl/`. */
export const BIN_DIR = 'bin'

export interface ShimTarget {
  /** The Node executable. */
  readonly node: string
  /** Node options the client needs, e.g. `--experimental-strip-types` when it runs from source on a Node that needs the flag. */
  readonly nodeOptions: readonly string[]
  /** The operator client's entry file. */
  readonly client: string
  /** True when `node` is Electron, which runs as Node only with `ELECTRON_RUN_AS_NODE` set. */
  readonly electron: boolean
}

/** The oldest Node the client runs on (the framework's own floor). */
const MIN_NODE = [22, 19]

/**
 * A real Node for the command, when the app runs inside Electron: Electron can run the client as Node, but on macOS every such call prints a code-signing complaint on stderr,
 * which lands in an agent's transcript. A `node` on the PATH that is new enough is used instead; without one, Electron runs the client. `find` is replaceable for tests.
 */
export function realNode(find: () => { path: string; version: string } | undefined = findNodeOnPath): string | undefined {
  const found = find()
  if (found === undefined) return undefined
  const [major = 0, minor = 0] = found.version.replace(/^v/u, '').split('.').map(Number)
  return major > MIN_NODE[0]! || (major === MIN_NODE[0] && minor >= MIN_NODE[1]!) ? found.path : undefined
}

function findNodeOnPath(): { path: string; version: string } | undefined {
  const located = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } })
  const path = located.status === 0 ? located.stdout.split(/\r?\n/u).find((line) => line.trim() !== '')?.trim() : undefined
  if (path === undefined) return undefined
  const asked = spawnSync(path, ['--version'], { encoding: 'utf8' })
  return asked.status === 0 ? { path, version: asked.stdout.trim() } : undefined
}

/** A word for `sh`: single-quoted, with each `'` closed, escaped and reopened. */
function shWord(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}

/** A word for `cmd.exe`: double-quoted; `%` doubled so a batch file does not expand it. A path cannot hold `"`. */
function cmdWord(value: string): string {
  return `"${value.replaceAll('%', '%%')}"`
}

export function posixShim(root: string, target: ShimTarget): string {
  const words = [target.node, ...target.nodeOptions, target.client, '--dir', root].map(shWord).join(' ')
  // Git Bash on Windows rewrites an argument such as /nope into C:/Program Files/Git/nope when it starts a native program; the door's paths must reach it as typed. Harmless elsewhere.
  const env = `${target.electron ? 'export ELECTRON_RUN_AS_NODE=1\n' : ''}export MSYS_NO_PATHCONV=1\nexport MSYS2_ARG_CONV_EXCL='*'\n`
  return `#!/bin/sh\n# This app's door (acryl-door): reaches only the app running from this folder. Rewritten each time the app starts.\n${env}exec ${words} "$@"\n`
}

export function windowsShim(root: string, target: ShimTarget): string {
  const words = [target.node, ...target.nodeOptions, target.client, '--dir', root].map(cmdWord).join(' ')
  const env = target.electron ? 'set ELECTRON_RUN_AS_NODE=1\r\n' : ''
  return `@echo off\r\nsetlocal\r\nrem This app's door (acryl-door): reaches only the app running from this folder. Rewritten each time the app starts.\r\n${env}${words} %*\r\n`
}

/** The error codes with which Windows refuses to replace a file that a running process (a `cmd.exe` executing the batch file) has open. */
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES'])

export interface ShimFs {
  readonly rename: (from: string, to: string) => void
  readonly pause: (ms: number) => void
}

const realFs: ShimFs = {
  rename: renameSync,
  // A synchronous sleep: the door writes the shims while it starts, and the wait is a few milliseconds at most.
  pause: (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) },
}

/**
 * Write `content` to `file` so a reader never sees half of it. A shim that already holds this content is left alone: a restart of the app (the dev server restarts on a change)
 * rewrites the same text, and on Windows replacing a batch file that an agent's `acryl` call is running fails with EPERM, which stopped the app from starting. A file that
 * is held while its content differs is retried for about a second, and then reported: the old shim stays (it still works), and the app starts.
 */
export function writeAtomically(file: string, content: string, mode: number, fs: ShimFs = realFs): void {
  try {
    if (readFileSync(file, 'utf8') === content) return
  } catch {
    // Not there yet, or unreadable: write it.
  }
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, content, { mode })
  if (process.platform !== 'win32') chmodSync(temporary, mode)
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.rename(temporary, file)
      return
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code
      if (code === undefined || !LOCKED.has(code) || attempt >= 10) {
        rmSync(temporary, { force: true })
        throw cause
      }
      fs.pause(25 * (attempt + 1))
    }
  }
}

/** Write `.acryl/bin/acryl` and `.acryl/bin/acryl.cmd` for the app at `root`. @returns the folder they are in. */
export function writeShims(root: string, target: ShimTarget): string {
  const bin = join(ensureStateDir(root), BIN_DIR)
  mkdirSync(bin, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') chmodSync(bin, 0o700)
  writeAtomically(join(bin, 'acryl'), posixShim(root, target), 0o700)
  writeAtomically(join(bin, 'acryl.cmd'), windowsShim(root, target), 0o600)
  return bin
}
