/**
 * The agent never sends the person's work out of the machine without their yes.
 *
 * Share and Push in the frame ask first (./app-plugins.ts, ./git-sync.ts); an agent with a shell could still run `git push`, `gh repo create` or
 * `npm publish` itself, and the access mode may let the shell run unasked. This guard reads each shell call before it runs (`tools/pre-execute`)
 * and turns one that pushes or publishes into DSH's own approval prompt (`ask`): the person sees the command and what it does, and it runs only
 * when they allow it once. A policy that already refused the call stays refused. The app's `save_app` tool, which pushes when the app has a remote,
 * asks the same way.
 *
 * It reads the command's words, so it is a seat belt for an honest agent, not a sandbox: a script that pushes from inside is not seen.
 */

const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'pwsh'])
/** Tools of the app that push by themselves. */
const OUTWARD_TOOLS: ReadonlyMap<string, string> = new Map([['save_app', 'save_app (it pushes when the app has a remote)']])

/** Words in front of a command that still run it: `sudo git push`, `env X=1 git push`, `timeout 60 npm publish`. */
const WRAPPERS: ReadonlySet<string> = new Set(['sudo', 'env', 'command', 'exec', 'nohup', 'time', 'timeout', 'xargs', 'npx', 'pnpx'])

/** `gh` commands that create or change something on GitHub. */
const GH_OUTWARD: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['repo', new Set(['create', 'edit', 'fork', 'rename', 'delete', 'archive', 'sync'])],
  ['release', new Set(['create', 'upload', 'edit', 'delete'])],
  ['pr', new Set(['create', 'merge', 'comment', 'review', 'close', 'edit'])],
  ['issue', new Set(['create', 'comment', 'close', 'edit', 'delete'])],
  ['gist', new Set(['create', 'edit', 'delete'])],
  ['secret', new Set(['set', 'delete'])],
  ['variable', new Set(['set', 'delete'])],
  ['workflow', new Set(['run'])],
])

/** Package managers' verbs that publish or change a published package. */
const PUBLISH_VERBS: ReadonlySet<string> = new Set(['publish', 'unpublish', 'deprecate', 'dist-tag', 'owner'])
const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn', 'bun'])

/** The command's simple commands: split on `;`, `&&`, `||`, `|`, `&` and new lines, each as words with quotes dropped. */
function simpleCommands(command: string): string[][] {
  return command
    .split(/\|\||&&|[;|&\n]/u)
    .map(part => part.trim().split(/\s+/u).map(word => word.replace(/^['"]|['"]$/gu, '')).filter(word => word !== ''))
    .filter(words => words.length > 0)
}

const program = (word: string): string => (word.split(/[\\/]/u).pop() ?? word).toLowerCase().replace(/\.exe$/u, '')

/** The words from the program on: env assignments and wrappers (with their own options and a timeout's duration) dropped. */
function fromProgram(words: readonly string[]): string[] {
  let at = 0
  while (at < words.length) {
    const word = words[at] ?? ''
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(word) || word.startsWith('-') || /^\d+[smhd]?$/u.test(word)) at += 1
    else if (WRAPPERS.has(program(word))) at += 1
    else break
  }
  return words.slice(at)
}

/** git's subcommand, past its global options (`-C <dir>`, `-c <key=value>`, `--git-dir=...`). */
function gitSubcommand(args: readonly string[]): string | undefined {
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? ''
    if (word === '-C' || word === '-c' || word === '--git-dir' || word === '--work-tree' || word === '--namespace') at += 1
    else if (!word.startsWith('-')) return word
  }
  return undefined
}

/** `gh api` that writes: an explicit method other than GET, or fields (which make it a POST). */
function ghApiWrites(args: readonly string[]): boolean {
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? ''
    const method = word === '-X' || word === '--method' ? args[at + 1] : /^(?:-X|--method=)(.+)$/u.exec(word)?.[1]
    if (method !== undefined && method.toUpperCase() !== 'GET') return true
    if (/^(?:-f|-F|--field|--raw-field|--input)(?:=|$)/u.test(word)) return true
  }
  return false
}

/** A rehearsal that sends nothing: `git push --dry-run` (or `-n`), `npm publish --dry-run`. */
const rehearses = (args: readonly string[], short?: string): boolean => args.some(word => word === '--dry-run' || (short !== undefined && word === short))

/** The app's share command told to send (`--confirm`), through a package manager's `run share` or `node plugins/save/share-cli.ts`. Without `--confirm` it only shows the plan. */
function sharesConfirmed(name: string, args: readonly string[]): boolean {
  if (!args.some(word => word === '--confirm' || word.startsWith('--confirm='))) return false
  if (args.some(word => /(?:^|[\\/])share-cli\.[cm]?[jt]s$/u.test(word))) return true
  const plain = args.filter(word => !word.startsWith('-'))
  return PACKAGE_MANAGERS.has(name) && (plain[0] === 'share' || (plain[0] === 'run' && plain[1] === 'share'))
}

/** What one simple command sends out, as the person would name it; undefined when it sends nothing. */
function outwardOf(words: readonly string[]): string | undefined {
  const [first, ...args] = fromProgram(words)
  if (first === undefined) return undefined
  const name = program(first)
  // The app's own share with the yes already given (`npm run share -- --confirm <plan>`, or its file run directly): it creates a repository and pushes.
  if (sharesConfirmed(name, args)) return 'share the app'
  if (name === 'git') return gitSubcommand(args) === 'push' && !rehearses(args, '-n') ? 'git push' : undefined
  if (name === 'gh') {
    const [group, verb] = args.filter(word => !word.startsWith('-'))
    if (group === 'api') return ghApiWrites(args) ? 'gh api (a write)' : undefined
    if (group !== undefined && verb !== undefined && GH_OUTWARD.get(group)?.has(verb) === true) return `gh ${group} ${verb}`
    return undefined
  }
  if (PACKAGE_MANAGERS.has(name)) {
    const verb = args.find(word => !word.startsWith('-'))
    return verb !== undefined && PUBLISH_VERBS.has(verb) && !rehearses(args) ? `${name} ${verb}` : undefined
  }
  return undefined
}

/** What a shell command sends out of the machine (`git push`, `gh repo create`, `npm publish`), or undefined when it sends nothing. */
export function outwardAction(command: string): string | undefined {
  for (const words of simpleCommands(command)) {
    const found = outwardOf(words)
    if (found !== undefined) return found
  }
  return undefined
}

/** The parts of a DSH tool call the guard reads. */
export interface OutwardExecution {
  readonly name: string
  readonly arguments?: unknown
}

/** DSH's pre-dispatch decision, the kinds this guard reads and returns. */
export type OutwardDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'deny'; readonly reason: string }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'ask'; readonly reason: string; readonly displayReason: { readonly en: string } }

export interface OutwardEvents {
  on(name: 'tools/pre-execute', listener: (exec: OutwardExecution, next: () => Promise<OutwardDecision>) => Promise<OutwardDecision>): () => void
}

function commandOf(args: unknown): string | undefined {
  let value = args
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return undefined
    }
  }
  const command = typeof value === 'object' && value !== null ? (value as { command?: unknown }).command : undefined
  return typeof command === 'string' ? command : undefined
}

/** The approval the person sees: what runs and why it asks. */
export function outwardQuestion(action: string, command: string | undefined): string {
  const shown = command === undefined ? action : command.length > 200 ? `${command.slice(0, 200)}…` : command
  return `The agent wants to run ${shown}. It sends your work out of this computer under your name (${action}). Allow it once?`
}

/** What a call needs: the approval to ask, or undefined when it sends nothing out. */
export function outwardApproval(exec: OutwardExecution): { readonly action: string; readonly command?: string } | undefined {
  const tool = OUTWARD_TOOLS.get(exec.name)
  if (tool !== undefined) return { action: tool }
  if (!SHELL_TOOLS.has(exec.name)) return undefined
  const command = commandOf(exec.arguments)
  const action = command === undefined ? undefined : outwardAction(command)
  return action === undefined ? undefined : { action, ...(command === undefined ? {} : { command }) }
}

/** Listen on DSH's pre-dispatch stage; returns the disposer. */
export function guardOutwardCommands(events: OutwardEvents, report: (line: string) => void): () => void {
  return events.on('tools/pre-execute', async (exec, next) => {
    const decided = await next()
    // A call another policy refused or cancelled stays so; only one that would run is held for the person's yes.
    if (decided.kind === 'deny' || decided.kind === 'cancel') return decided
    const needs = outwardApproval(exec)
    if (needs === undefined) return decided
    report(`@acryldev/blends-frame: asked the person before ${needs.action}`)
    return { kind: 'ask', reason: `outward: ${needs.action}`, displayReason: { en: outwardQuestion(needs.action, needs.command) } }
  })
}
