/**
 * The app folder's own command (spec 049 slice 10): `<app>/.acryl/bin/acryl` (and `acryl.cmd` on Windows) runs this door's operator
 * client against this folder only (`--dir <app>`), with the Node that runs the app. An agent working in the folder calls it by that path,
 * so it reaches the app running from this folder and never a user's own `acryl` on PATH or another app's door.
 *
 * Written each time the door starts, so a moved app or a new Node is picked up. It stays when the app stops: run then, it says that no
 * app is running in the folder (exit 3). It carries no secret; the client reads `door.json` at each call.
 */

import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
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
  const env = target.electron ? 'export ELECTRON_RUN_AS_NODE=1\n' : ''
  return `#!/bin/sh\n# This app's door (acryl-door): reaches only the app running from this folder. Rewritten each time the app starts.\n${env}exec ${words} "$@"\n`
}

export function windowsShim(root: string, target: ShimTarget): string {
  const words = [target.node, ...target.nodeOptions, target.client, '--dir', root].map(cmdWord).join(' ')
  const env = target.electron ? 'set ELECTRON_RUN_AS_NODE=1\r\n' : ''
  return `@echo off\r\nsetlocal\r\nrem This app's door (acryl-door): reaches only the app running from this folder. Rewritten each time the app starts.\r\n${env}${words} %*\r\n`
}

function writeAtomically(file: string, content: string, mode: number): void {
  const temporary = `${file}.${String(process.pid)}.tmp`
  writeFileSync(temporary, content, { mode })
  if (process.platform !== 'win32') chmodSync(temporary, mode)
  renameSync(temporary, file)
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
