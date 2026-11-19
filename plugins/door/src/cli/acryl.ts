#!/usr/bin/env node
/**
 * The door's operator client: what `npm run acryl -- <verb>` and `<app>/.acryl/bin/acryl` run. It finds the app from the folder it is started in (the nearest
 * `.acryl/door.json` upward, or `--dir`), never through PATH or a machine-wide registry, so it reaches only the app running from that
 * folder. The secret is read from that file and sent as a `Bearer` header; it is never printed.
 *
 *   acryl brief | look | act <op> ... | plugin list|add|remove|reload | tool list|call | window list|open|focus|close|resize | menu list|click | verbs      (--json for the raw value)
 *   acryl control <...>   the same, the ACRYL Host form (`control snapshot`, `control click`, ... are look and act)
 *
 * Exit codes: 0 done, 1 the verb failed (its code and message are printed), 2 a usage error, 3 no running app in this folder.
 */

import { createInterface } from 'node:readline/promises'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDoorFile, STATE_DIR, DOOR_FILE } from '../host/door-file.ts'

const ACT_OPS = new Set(['click', 'type', 'select', 'press', 'scroll', 'wait', 'reload', 'navigate'])
const VALUED = new Set(['--dir', '--owner', '--license', '--ref', '--text', '--option', '--key', '--direction', '--amount', '--cursor', '--max-nodes', '--role', '--name', '--timeout-ms', '--id', '--width', '--height', '--window', '--tool', '--args', '--path', '--from'])
const FLAGS = new Set(['--json', '--submit', '--no-clear', '--gone', '--force', '--help'])

export class UsageError extends Error {}

export interface Invocation {
  readonly verb: string
  readonly args: Record<string, unknown>
  readonly json: boolean
  readonly dir: string | undefined
  /** Things the client changed or noticed in the command line; printed to stderr before the call. */
  readonly warnings: readonly string[]
}

const USAGE = `usage: acryl <verb> [options] [--json] [--dir <app folder>]
  brief
  look [--cursor <n>] [--max-nodes <n>] [--window <n>]
  act click --ref <r>
  act type --ref <r> --text <t> [--submit] [--no-clear]
  act select --ref <r> --option <o>
  act press --key <key> [--ref <r>]
  act scroll --direction up|down|left|right [--ref <r>] [--amount <px>]
  act reload
  act navigate --path <path of the app, e.g. /demo>
  act wait (--text <t> | --role <role> [--name <n>]) [--gone] [--timeout-ms <ms>]
  (look and every act take --window <n>: the desktop window whose page it is for; window list prints the numbers)
  plugin list | plugin add <folder> | plugin pull <source> | plugin publish <name> [--owner <account>] [--license <id>] | plugin remove <name> | plugin reload
  window list | window open [--path <p>] | window focus --id <n> | window close --id <n> [--force]
  window resize --id <n> --width <px> --height <px>
  menu list | menu click --path "File>New Note" [--force]
  tool list | tool call --tool <name> [--args '<json>']
  verbs`

/**
 * Git for Windows' bash (MSYS) turns an argument that looks like a Unix path into a Windows path before a native program sees it: `--path /nope` arrives as
 * `C:/Program Files/Git/nope`. The shim stops that (MSYS_NO_PATHCONV), but a command that does not go through the shim, or an MSYS that ignores the variable, would still
 * send the app a path it can never serve. A path that begins with the Git install folder is turned back into the path the person typed, with a warning. Only `--path` is read this way.
 */
export function undoMsysPath(value: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, warnings: string[]): string {
  if (platform !== 'win32' || !/^[A-Za-z]:[\\/]/u.test(value)) return value
  const roots = new Set<string>()
  if (env.EXEPATH) roots.add(env.EXEPATH)
  for (const folder of (env.PATH ?? env.Path ?? '').split(';')) {
    const found = /^(.*[\\/]Git)[\\/](?:usr[\\/]bin|cmd|bin|mingw64[\\/]bin)[\\/]?$/iu.exec(folder.trim())
    if (found?.[1]) roots.add(found[1])
  }
  const flat = value.replaceAll('\\', '/')
  for (const root of roots) {
    const prefix = `${root.replaceAll('\\', '/').replace(/\/+$/u, '')}/`
    if (flat.toLowerCase().startsWith(prefix.toLowerCase())) {
      const path = `/${flat.slice(prefix.length)}`
      warnings.push(`warning: Git Bash changed the path you typed into "${value}"; using "${path}". Run the command through .acryl/bin/acryl, or set MSYS_NO_PATHCONV=1, so it stays as typed.`)
      return path
    }
  }
  return value
}

function integer(values: Map<string, string>, flag: string): number | undefined {
  const raw = values.get(flag)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new UsageError(`${flag} must be a non-negative integer`)
  return value
}

/** @throws UsageError. */
export function parseInvocation(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Invocation {
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
  const warnings: string[] = []
  const make = (verb: string, args: Record<string, unknown> = {}): Invocation => ({ verb, args, json, dir, warnings })
  switch (first) {
    case 'brief': return make('brief')
    case 'verbs': return make('verbs')
    case 'look': {
      const cursor = integer(values, '--cursor')
      const maxNodes = integer(values, '--max-nodes')
      const window = integer(values, '--window')
      return make('look', { ...(cursor === undefined ? {} : { cursor }), ...(maxNodes === undefined ? {} : { maxNodes }), ...(window === undefined ? {} : { window }) })
    }
    case 'act': {
      if (second === undefined || !ACT_OPS.has(second)) throw new UsageError(`act needs one of ${[...ACT_OPS].join(', ')}\n${USAGE}`)
      const amount = integer(values, '--amount')
      const timeoutMs = integer(values, '--timeout-ms')
      const window = integer(values, '--window')
      const pick = (flag: string, key: string): Record<string, string> => (values.has(flag) ? { [key]: values.get(flag) as string } : {})
      return make('act', {
        op: second,
        ...pick('--ref', 'ref'), ...pick('--text', 'text'), ...pick('--option', 'option'), ...pick('--key', 'key'),
        ...pick('--direction', 'direction'), ...pick('--role', 'role'), ...pick('--name', 'name'), ...(values.has('--path') ? { path: undoMsysPath(values.get('--path') as string, env, platform, warnings) } : {}),
        ...(amount === undefined ? {} : { amount }),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        ...(window === undefined ? {} : { window }),
        ...(set.has('--submit') ? { submit: true } : {}),
        ...(set.has('--no-clear') ? { clear: false } : {}),
        ...(set.has('--gone') ? { gone: true } : {}),
      })
    }
    case 'plugin': {
      if (second === 'list' || second === 'reload') return make(`plugin-${second}`)
      if (second === 'add') { if (third === undefined) throw new UsageError('plugin add needs a folder, e.g. plugin add plugins/pomodoro'); return make('plugin-add', { folder: third }) }
      if (second === 'pull') {
        const from = values.get('--from')
        if (from !== undefined) { if (third !== undefined) throw new UsageError('plugin pull takes a source or --from <list>, not both'); return make('plugin-pull', { from }) }
        if (third === undefined) throw new UsageError('plugin pull needs a source, e.g. plugin pull github:someone/pomodoro@0.1.0, or --from <list>')
        return make('plugin-pull', { source: third })
      }
      if (second === 'publish') {
        if (third === undefined) throw new UsageError('plugin publish needs a plugin name, e.g. plugin publish pomodoro')
        const owner = values.get('--owner')
        const license = values.get('--license')
        return make('plugin-publish', { name: third, ...(owner === undefined ? {} : { owner }), ...(license === undefined ? {} : { license }) })
      }
      if (second === 'remove') { if (third === undefined) throw new UsageError('plugin remove needs a plugin name'); return make('plugin-remove', { name: third }) }
      throw new UsageError(`plugin needs list, add, pull, publish, remove or reload\n${USAGE}`)
    }
    case 'window': {
      const id = integer(values, '--id')
      if (second === 'list') return make('window-list')
      if (second === 'open') return make('window-open', values.has('--path') ? { path: undoMsysPath(values.get('--path') as string, env, platform, warnings) } : {})
      if (second === 'focus' || second === 'close' || second === 'resize') {
        if (id === undefined) throw new UsageError(`window ${second} needs --id <n> (window list prints the ids)`)
        if (second === 'focus') return make('window-focus', { id })
        if (second === 'close') return make('window-close', { id, ...(set.has('--force') ? { force: true } : {}) })
        const width = integer(values, '--width')
        const height = integer(values, '--height')
        if (width === undefined || height === undefined) throw new UsageError('window resize needs --width <px> and --height <px>')
        return make('window-resize', { id, width, height })
      }
      throw new UsageError(`window needs list, open, focus, close or resize\n${USAGE}`)
    }
    case 'menu': {
      if (second === 'list') return make('menu-list')
      if (second === 'click') {
        const path = values.get('--path')
        if (path === undefined) throw new UsageError('menu click needs --path "File>New Note" (menu list prints the paths)')
        return make('menu-click', { path, ...(set.has('--force') ? { force: true } : {}) })
      }
      throw new UsageError(`menu needs list or click\n${USAGE}`)
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

/**
 * The app folder: `--dir`, or the nearest folder upward from `cwd` that has `.acryl/door.json`. When no app is running, the nearest folder that is an app (it
 * has a `blend.yaml`), so "no running app in <that folder>" names the app. A folder that only has a `.acryl/` is not an app: the person's `~/.acryl` is ACRYL's
 * own home, and it must never be taken for the app the command was run in.
 */
export function findApp(cwd: string, dir: string | undefined): string | undefined {
  if (dir !== undefined) return resolve(cwd, dir)
  let fallback: string | undefined
  for (let at = resolve(cwd); ; at = dirname(at)) {
    if (existsSync(join(at, STATE_DIR, DOOR_FILE))) return at
    if (fallback === undefined && existsSync(join(at, 'blend.yaml'))) fallback = at
    if (dirname(at) === at) return fallback
  }
}

export interface Io {
  readonly cwd: string
  readonly out: (text: string) => void
  readonly err: (text: string) => void
  readonly fetch?: typeof fetch
  /**
   * Ask the person at this terminal; absent when nobody is there (a pipe, an agent's shell), and then nothing that needs a yes can happen.
   * @returns whether they said yes.
   */
  readonly ask?: (question: string) => Promise<boolean>
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
  for (const warning of invocation.warnings) io.err(`${warning}\n`)
  const app = findApp(io.cwd, invocation.dir)
  const file = app === undefined ? undefined : readDoorFile(app)
  if (app === undefined || file === undefined) {
    io.err(`no running app${app === undefined ? ` in ${io.cwd} or above it` : ` in ${app}`}: these commands reach the running app, so start it (npm run dev) in its folder in another terminal, then run the same line again\n`)
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
    io.err(`no running app in ${app}: ${file.url} does not answer (it stopped without removing .acryl/door.json?); start it (npm run dev), then run the same line again\n`)
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
  if (invocation.verb === 'plugin-publish' && io.ask !== undefined && isPlan(body.value)) return confirmPublish(invocation, body.value, io, request, `${file.url}/api/acryl-door/publish-confirmed`, headers)
  return 0
}

const isPlan = (value: unknown): value is PlanAsked =>
  typeof value === 'object' && value !== null && 'owner' in value

/** What the prompt names. */
interface PlanAsked {
  readonly owner: string
  readonly repo: string
  readonly version: string
  readonly license: string
}

/** The person's yes: only what they just read is published, and anything but a plain yes sends nothing. */
async function confirmPublish(
  invocation: Invocation,
  plan: PlanAsked,
  io: Io,
  request: typeof fetch,
  url: string,
  headers: Record<string, string>,
): Promise<number> {
  const yes = await io.ask?.(`Publish ${plan.owner}/${plan.repo} v${plan.version} under ${plan.license}? Type yes to send it: `)
  if (yes !== true) { io.out('Nothing was sent.\n'); return 0 }
  const response = await request(url, { method: 'POST', headers, body: JSON.stringify({ name: invocation.args.name, owner: invocation.args.owner, license: invocation.args.license, confirm: plan }) })
  const body = await response.json().catch(() => undefined) as { ok?: boolean; message?: string; value?: { ok?: boolean; releaseUrl?: string; pullLine?: string; reason?: string; next?: string } } | undefined
  const result = body?.value
  if (body?.ok !== true || result?.ok !== true) {
    io.err(`Not published: ${result?.reason ?? body?.message ?? 'the app did not answer'}${result?.next === undefined ? '' : `. ${result.next}`}\n`)
    return 1
  }
  io.out(`Published: ${result.releaseUrl ?? ''}\nA friend gets exactly these bytes with:\n  ${result.pullLine ?? ''}\n`)
  return 0
}

async function askAtTerminal(question: string): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await prompt.question(question)).trim().toLowerCase() === 'yes'
  } finally {
    prompt.close()
  }
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
    ...(process.stdin.isTTY && process.stdout.isTTY ? { ask: askAtTerminal } : {}),
  }).then((code) => { process.exitCode = code }, (cause: unknown) => {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`)
    process.exitCode = 1
  })
}
