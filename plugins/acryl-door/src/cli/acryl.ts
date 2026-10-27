#!/usr/bin/env node
/**
 * The door's operator client: what `<app>/.acryl/bin/acryl` runs. It finds the app from the folder it is started in (the nearest
 * `.acryl/door.json` upward, or `--dir`), never through PATH or a machine-wide registry, so it reaches only the app running from that
 * folder. The secret is read from that file and sent as a `Bearer` header; it is never printed.
 *
 *   acryl brief | look | act <op> ... | plugin list|add|remove|reload | tool list|call | verbs      (--json for the raw value)
 *   acryl control <...>   the same, the ACRYL Host form (`control snapshot`, `control click`, ... are look and act)
 *
 * Exit codes: 0 done, 1 the verb failed (its code and message are printed), 2 a usage error, 3 no running app in this folder.
 */

import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDoorFile, STATE_DIR, DOOR_FILE } from '../host/door-file.ts'

const ACT_OPS = new Set(['click', 'type', 'select', 'press', 'scroll', 'wait'])
const VALUED = new Set(['--dir', '--ref', '--text', '--option', '--key', '--direction', '--amount', '--cursor', '--max-nodes', '--role', '--name', '--timeout-ms', '--tool', '--args'])
const FLAGS = new Set(['--json', '--submit', '--no-clear', '--gone', '--help'])

export class UsageError extends Error {}

export interface Invocation {
  readonly verb: string
  readonly args: Record<string, unknown>
  readonly json: boolean
  readonly dir: string | undefined
}

const USAGE = `usage: acryl <verb> [options] [--json] [--dir <app folder>]
  brief
  look [--cursor <n>] [--max-nodes <n>]
  act click --ref <r>
  act type --ref <r> --text <t> [--submit] [--no-clear]
  act select --ref <r> --option <o>
  act press --key <key> [--ref <r>]
  act scroll --direction up|down|left|right [--ref <r>] [--amount <px>]
  act wait (--text <t> | --role <role> [--name <n>]) [--gone] [--timeout-ms <ms>]
  plugin list | plugin add <folder> | plugin remove <name> | plugin reload
  tool list | tool call --tool <name> [--args '<json>']
  verbs`

function integer(values: Map<string, string>, flag: string): number | undefined {
  const raw = values.get(flag)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new UsageError(`${flag} must be a non-negative integer`)
  return value
}

/** @throws UsageError. */
export function parseInvocation(argv: readonly string[]): Invocation {
  const words: string[] = []
  const values = new Map<string, string>()
  const set = new Set<string>()
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at] as string
    if (VALUED.has(arg)) {
      const value = argv[at + 1]
      if (value === undefined) throw new UsageError(`${arg} needs a value`)
      values.set(arg, value)
      at += 1
    } else if (FLAGS.has(arg)) set.add(arg)
    else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`)
    else words.push(arg)
  }
  if (set.has('--help')) throw new UsageError(USAGE)
  if (words[0] === 'control') words.shift()
  // The ACRYL Host form: `control snapshot` is look, `control click` is act click.
  if (words[0] === 'snapshot') words[0] = 'look'
  else if (words[0] !== undefined && ACT_OPS.has(words[0])) words.unshift('act')
  const [first, second, third] = words
  const json = set.has('--json')
  const dir = values.get('--dir')
  const make = (verb: string, args: Record<string, unknown> = {}): Invocation => ({ verb, args, json, dir })
  switch (first) {
    case 'brief': return make('brief')
    case 'verbs': return make('verbs')
    case 'look': {
      const cursor = integer(values, '--cursor')
      const maxNodes = integer(values, '--max-nodes')
      return make('look', { ...(cursor === undefined ? {} : { cursor }), ...(maxNodes === undefined ? {} : { maxNodes }) })
    }
    case 'act': {
      if (second === undefined || !ACT_OPS.has(second)) throw new UsageError(`act needs one of ${[...ACT_OPS].join(', ')}\n${USAGE}`)
      const amount = integer(values, '--amount')
      const timeoutMs = integer(values, '--timeout-ms')
      const pick = (flag: string, key: string): Record<string, string> => (values.has(flag) ? { [key]: values.get(flag) as string } : {})
      return make('act', {
        op: second,
        ...pick('--ref', 'ref'), ...pick('--text', 'text'), ...pick('--option', 'option'), ...pick('--key', 'key'),
        ...pick('--direction', 'direction'), ...pick('--role', 'role'), ...pick('--name', 'name'),
        ...(amount === undefined ? {} : { amount }),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(set.has('--submit') ? { submit: true } : {}),
        ...(set.has('--no-clear') ? { clear: false } : {}),
        ...(set.has('--gone') ? { gone: true } : {}),
      })
    }
    case 'plugin': {
      if (second === 'list' || second === 'reload') return make(`plugin-${second}`)
      if (second === 'add') { if (third === undefined) throw new UsageError('plugin add needs a folder, e.g. plugin add plugins/pomodoro'); return make('plugin-add', { folder: third }) }
      if (second === 'remove') { if (third === undefined) throw new UsageError('plugin remove needs a plugin name'); return make('plugin-remove', { name: third }) }
      throw new UsageError(`plugin needs list, add, remove or reload\n${USAGE}`)
    }
    case 'tool': {
      if (second === 'list') return make('tool-list')
      if (second === 'call') {
        const tool = values.get('--tool')
        if (tool === undefined) throw new UsageError('tool call needs --tool <name>')
        const raw = values.get('--args')
        let args: unknown = {}
        if (raw !== undefined) {
          try { args = JSON.parse(raw) } catch { throw new UsageError('--args must be JSON') }
        }
        return make('tool-call', { tool, args })
      }
      throw new UsageError(`tool needs list or call\n${USAGE}`)
    }
    default: throw new UsageError(USAGE)
  }
}

/** The app folder: `--dir`, or the nearest folder upward from `cwd` that has `.acryl/door.json` (or at least `.acryl/`). */
export function findApp(cwd: string, dir: string | undefined): string | undefined {
  if (dir !== undefined) return resolve(cwd, dir)
  let fallback: string | undefined
  for (let at = resolve(cwd); ; at = dirname(at)) {
    if (existsSync(join(at, STATE_DIR, DOOR_FILE))) return at
    if (fallback === undefined && existsSync(join(at, STATE_DIR))) fallback = at
    if (dirname(at) === at) return fallback
  }
}

export interface Io {
  readonly cwd: string
  readonly out: (text: string) => void
  readonly err: (text: string) => void
  readonly fetch?: typeof fetch
}

/** Run one invocation. @returns the exit code. */
export async function main(argv: readonly string[], io: Io): Promise<number> {
  let invocation: Invocation
  try {
    invocation = parseInvocation(argv)
  } catch (cause) {
    if (cause instanceof UsageError) { io.err(`${cause.message}\n`); return 2 }
    throw cause
  }
  const app = findApp(io.cwd, invocation.dir)
  const file = app === undefined ? undefined : readDoorFile(app)
  if (app === undefined || file === undefined) {
    io.err(`no running app${app === undefined ? ` in ${io.cwd} or above it` : ` in ${app}`}: start it (npm run dev) in its folder, then try again\n`)
    return 3
  }
  const request = io.fetch ?? fetch
  const headers = { authorization: `Bearer ${file.secret}`, 'content-type': 'application/json' }
  let response: Response
  try {
    response = invocation.verb === 'verbs'
      ? await request(`${file.url}/api/acryl-door/verbs`, { headers })
      : await request(`${file.url}/api/acryl-door/call`, { method: 'POST', headers, body: JSON.stringify({ verb: invocation.verb, args: invocation.args }) })
  } catch {
    io.err(`no running app in ${app}: ${file.url} does not answer (it stopped without removing .acryl/door.json?); start it again\n`)
    return 3
  }
  if (response.status === 403) {
    io.err(`refused by the app in ${app}: the secret did not match (the app restarted? run the command again)\n`)
    return 1
  }
  const body = await response.json().catch(() => undefined) as { ok?: boolean; value?: unknown; text?: string; code?: string; message?: string; verbs?: unknown } | undefined
  if (body === undefined) { io.err(`the app answered ${String(response.status)} with no readable body\n`); return 1 }
  if (invocation.verb === 'verbs') {
    io.out(invocation.json ? `${JSON.stringify(body.verbs)}\n` : `${(body.verbs as string[]).join('\n')}\n`)
    return 0
  }
  if (body.ok !== true) {
    io.err(invocation.json ? `${JSON.stringify(body)}\n` : `${body.code ?? 'error'}: ${body.message ?? JSON.stringify(body)}\n`)
    return 1
  }
  io.out(invocation.json ? `${JSON.stringify(body.value)}\n` : `${body.text ?? ''}\n`)
  return 0
}

/** True when this file is the program Node was started with (not imported by a test). */
function isProgram(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isProgram()) {
  main(process.argv.slice(2), {
    cwd: process.cwd(),
    out: (text) => { process.stdout.write(text) },
    err: (text) => { process.stderr.write(text) },
  }).then((code) => { process.exitCode = code }, (cause: unknown) => {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}
