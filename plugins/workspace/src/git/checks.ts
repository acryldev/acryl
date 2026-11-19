/** Read-only discovery of the checks a worktree can run: its package.json scripts and package manager. */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { CheckManager, CheckScript, GitChecksView } from './contract.ts'

const MAX_PACKAGE_JSON_BYTES = 256 * 1024
const MAX_SCRIPTS = 60
/** A script name is typed into a shell on the user's behalf, so only plain names are ever offered. */
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,63}$/
const PRIMARY = /^(check|verify|ci|test|tests|lint|typecheck|type-check|build|format)([:._-].*)?$/i

const LOCKFILES: readonly (readonly [string, CheckManager])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** The manager the project itself uses: its lockfile, else null (the caller then runs plain `npm`). */
export async function detectManager(dir: string): Promise<CheckManager | null> {
  for (const [file, manager] of LOCKFILES) {
    if (await exists(join(dir, file))) return manager
  }
  return null
}

/** Parse `package.json` scripts; a missing, oversized or malformed file simply means "no scripts". */
export function parseScripts(text: string): CheckScript[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return []
  const scripts = (parsed as { scripts?: unknown }).scripts
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return []
  const out: CheckScript[] = []
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string' || !SAFE_SCRIPT_NAME.test(name)) continue
    out.push({ name, command: command.slice(0, 300), primary: PRIMARY.test(name) })
  }
  // Check-like scripts first, otherwise keep the file's order.
  out.sort((a, b) => Number(b.primary) - Number(a.primary))
  return out.slice(0, MAX_SCRIPTS)
}

/** @param dir - an already validated absolute worktree directory. */
export async function readWorktreeChecks(dir: string): Promise<GitChecksView> {
  let scripts: CheckScript[] = []
  try {
    const file = join(dir, 'package.json')
    if ((await stat(file)).size <= MAX_PACKAGE_JSON_BYTES) scripts = parseScripts(await readFile(file, 'utf8'))
  } catch {
    scripts = []
  }
  return { path: dir, manager: await detectManager(dir), scripts }
}
