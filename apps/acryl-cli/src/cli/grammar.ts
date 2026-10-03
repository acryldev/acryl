export type AcrylHostCommand = 'tui' | 'gui' | 'web'

/**
 * What `acryl plugin` can do. `list`, `enable`, `disable`, and `doctor` are
 * implemented here; `add` and `remove` are install/reconcile (spec 034, T006)
 * and are recognized so the command surface matches `plan.md`, then refused
 * with a pointer rather than reported as an unknown action.
 */
export type AcrylPluginAction = 'list' | 'enable' | 'disable' | 'doctor' | 'add' | 'remove'

interface AcrylInvocationFlags {
  readonly json: boolean
  readonly version: boolean
  readonly help: boolean
  /** Named ACRYL profile; absent means this surface's own default profile. */
  readonly profile?: string
}

export interface AcrylSurfaceInvocation extends AcrylInvocationFlags {
  readonly kind: 'surface'
  readonly command: AcrylHostCommand
  readonly resumeSessionId?: string
}

export interface AcrylPluginInvocation extends AcrylInvocationFlags {
  readonly kind: 'plugin'
  readonly action: AcrylPluginAction
  /** Loader entry id, row id, or package name the action targets. */
  readonly entryId?: string
}

/** What `acryl ui` can do (spec 038-ui-component-library, T038): copy or inspect a registry item. */
export type AcrylUiAction = 'list' | 'add' | 'diff'

export interface AcrylUiInvocation extends AcrylInvocationFlags {
  readonly kind: 'ui'
  readonly action: AcrylUiAction
  readonly id?: string
  readonly targetDir?: string
  readonly surface?: string
  /** Registry directory (a local clone of `acryl-ui-registry`, or a path shaped like it); defaults to `ACRYL_UI_REGISTRY` or the cwd. */
  readonly registryDir?: string
}

/**
 * `acryl doctor`: diagnose a profile from its files and logs, without starting the app (spec 041, Scope B).
 * Works when Desktop or Web cannot launch.
 */
export interface AcrylDoctorInvocation extends AcrylInvocationFlags {
  readonly kind: 'doctor'
  /** The engine home to inspect, for repairing another profile home (a dev home) from a working one. */
  readonly home?: string
}

/** `acryl repair`: plan, apply or undo the safe repairs for what `acryl doctor` finds. */
export interface AcrylRepairInvocation extends AcrylInvocationFlags {
  readonly kind: 'repair'
  readonly home?: string
  /** Print the plan and stop. */
  readonly dryRun: boolean
  /** Apply without asking; only allowed together with named recipes. */
  readonly yes: boolean
  /** The recipes to run (default: every safe recipe that has a matching finding). */
  readonly recipes: readonly string[]
  /** Put back the files a previous repair changed, by the backup id it printed. */
  readonly undo?: string
}

/** `acryl new <dir>`: create an ACRYL Blends app (spec 036), like `rails new`. */
export interface AcrylNewInvocation extends AcrylInvocationFlags {
  readonly kind: 'new'
  readonly dir: string
  readonly title?: string
  readonly blueprint?: string
  readonly accent?: string
  readonly tagline?: string
  /** An extracted ACRYL Web release archive the app carries, so it starts with nothing of the framework but Node. */
  readonly runtime?: string
  /** Do not create a git repository in the new app. */
  readonly skipGit?: boolean
  /** Create the app from an app or Blend folder, a git repository, or a registry starter id, instead of a Blueprint. */
  readonly from?: string
  /** The registry a starter id is looked up in (a git URL, `#<folder>` allowed, or a folder); the public registry by default. */
  readonly registry?: string
}

/** `acryl save`: commit the app and push it to its remote (secret check and private/public guard first). */
export interface AcrylSaveInvocation extends AcrylInvocationFlags {
  readonly kind: 'save'
  readonly dir: string
  readonly message?: string
}

/** `acryl remote connect`: give the app a remote repository (created through the user's own gh login, or an existing URL). */
export interface AcrylRemoteInvocation extends AcrylInvocationFlags {
  readonly kind: 'remote'
  readonly dir: string
  readonly name?: string
  readonly url?: string
  readonly visibility?: 'private' | 'public'
}

/**
 * `acryl control`: the online channel's own CLI surface (spec 041 TB31). Named `control`, not `app` (the
 * task text's own working name), because `app` already names a Blends application throughout this CLI
 * (`acryl new`, `acryl save`, `acryl remote`); reusing it here for "the running window this drives" would
 * collide with that, not extend it.
 */
export type AcrylControlAction = 'list' | 'snapshot' | 'click' | 'type' | 'select' | 'press' | 'scroll' | 'wait' | 'worker'

/** `acryl control worker <op>`: bring-your-own agents (Claude Code) running under the app, driven through its Host. */
export type AcrylWorkerOp = 'list' | 'attach' | 'send' | 'cancel' | 'stop'

export interface AcrylControlInvocation extends AcrylInvocationFlags {
  readonly kind: 'control'
  readonly action: AcrylControlAction
  /** For `worker`: which operation. */
  readonly workerOp?: AcrylWorkerOp
  readonly cwd?: string
  readonly worker?: string
  readonly provider?: string
  readonly resume?: string
  /** Which running instance to drive, by id or name; required only when more than one is running. */
  readonly app?: string
  readonly ref?: string
  readonly text?: string
  readonly option?: string
  readonly key?: string
  readonly direction?: 'up' | 'down' | 'left' | 'right'
  readonly amount?: number
  readonly submit?: boolean
  readonly noClear?: boolean
  readonly cursor?: number
  readonly maxNodes?: number
  readonly role?: string
  readonly name?: string
  readonly gone?: boolean
  readonly timeoutMs?: number
}

export type AcrylInvocation = AcrylSurfaceInvocation | AcrylPluginInvocation | AcrylUiInvocation | AcrylDoctorInvocation | AcrylRepairInvocation | AcrylNewInvocation | AcrylSaveInvocation | AcrylRemoteInvocation | AcrylControlInvocation

/** Options of the app persistence commands: `--dir` (default the current folder) and command-specific values. */
function parseAppOptions(args: readonly string[], valued: ReadonlySet<string>, flags: ReadonlySet<string>): { values: Map<string, string>, set: Set<string>, json: boolean } {
  const values = new Map<string, string>()
  const set = new Set<string>()
  let json = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? ''
    if (argument === '--json') { json = true; continue }
    if (valued.has(argument)) {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Error(`${argument} requires a value`)
      if (values.has(argument)) throw new Error(`${argument} may be provided only once`)
      values.set(argument, value)
      index += 1
      continue
    }
    if (flags.has(argument)) { set.add(argument); continue }
    throw new Error(`unknown argument: ${argument}`)
  }
  return { values, set, json }
}

function parseSaveInvocation(args: readonly string[]): AcrylSaveInvocation {
  const { values, json } = parseAppOptions(args, new Set(['--dir', '-m', '--message']), new Set())
  const message = values.get('-m') ?? values.get('--message')
  return { kind: 'save', dir: values.get('--dir') ?? '.', json, version: false, help: false, ...(message === undefined ? {} : { message }) }
}

function parseRemoteInvocation(args: readonly string[]): AcrylRemoteInvocation {
  if (args[0] !== 'connect') throw new Error('usage: acryl remote connect [--dir <app>] [--name <repository>] [--public | --private] [--url <existing repository>]')
  const { values, set, json } = parseAppOptions(args.slice(1), new Set(['--dir', '--name', '--url']), new Set(['--public', '--private']))
  if (set.has('--public') && set.has('--private')) throw new Error('--public and --private are alternatives')
  const name = values.get('--name')
  const url = values.get('--url')
  return {
    kind: 'remote', dir: values.get('--dir') ?? '.', json, version: false, help: false,
    ...(name === undefined ? {} : { name }), ...(url === undefined ? {} : { url }),
    ...(set.has('--public') ? { visibility: 'public' as const } : set.has('--private') ? { visibility: 'private' as const } : {}),
  }
}

const NEW_OPTIONS: Readonly<Record<string, 'title' | 'blueprint' | 'accent' | 'tagline' | 'runtime' | 'from' | 'registry'>> = { '--name': 'title', '--blueprint': 'blueprint', '--accent': 'accent', '--tagline': 'tagline', '--runtime': 'runtime', '--from': 'from', '--registry': 'registry' }

/** `new` has its own options, so it is parsed on its own rather than threaded through every other command's flags. */
function parseNewInvocation(args: readonly string[]): AcrylNewInvocation {
  const values: { title?: string, blueprint?: string, accent?: string, tagline?: string, runtime?: string, from?: string, registry?: string } = {}
  const positional: string[] = []
  let json = false
  let help = false
  let skipGit = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? ''
    if (argument === '--json') { json = true; continue }
    if (argument === '--help' || argument === '-h') { help = true; continue }
    if (argument === '--skip-git') { skipGit = true; continue }
    const key = NEW_OPTIONS[argument]
    if (key !== undefined) {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Error(`${argument} requires a value`)
      if (values[key] !== undefined) throw new Error(`${argument} may be provided only once`)
      values[key] = value
      index += 1
      continue
    }
    if (argument.startsWith('-')) throw new Error(`unknown option for new: ${argument}`)
    positional.push(argument)
  }
  if (help) return { kind: 'new', dir: '', json, version: false, help: true }
  if (values.from !== undefined && values.blueprint !== undefined) throw new Error('--from and --blueprint are alternatives: an app grows from one of them')
  if (positional.length !== 1) throw new Error('usage: acryl new <dir> [--name "My App"] [--blueprint acryl.blank] [--accent "#e8590c"] [--tagline "..."] [--runtime <extracted acryl-web archive>] [--from <app folder | git URL | starter id>] [--registry <git URL | folder>]')
  return { kind: 'new', dir: positional[0] ?? '', json, version: false, help: false, ...values, ...(skipGit ? { skipGit } : {}) }
}

const UI_ACTIONS = new Set<AcrylUiAction>(['list', 'add', 'diff'])
/** Actions that name a registry item. */
const UI_TARGET_ACTIONS = new Set<AcrylUiAction>(['add', 'diff'])

function uiAction(value: string): AcrylUiAction | undefined {
  return UI_ACTIONS.has(value as AcrylUiAction) ? value as AcrylUiAction : undefined
}

/** `acryl ui …`: the command word plus its own arguments (id, target directory) and flags (`--surface`, `--registry`). */
function parseUiInvocation(
  rest: readonly string[],
  flags: AcrylInvocationFlags,
  surface: string | undefined,
  registryDir: string | undefined,
): AcrylUiInvocation {
  const [rawAction, ...positional] = rest
  const action = rawAction === undefined ? 'list' : uiAction(rawAction)
  if (action === undefined) throw new Error(`unknown ui action: ${rawAction}`)
  if (action === 'list') {
    if (positional.length > 0) throw new Error(`unexpected argument for ui list: ${positional[0]}`)
    return { ...flags, kind: 'ui', action, ...(registryDir === undefined ? {} : { registryDir }) }
  }
  const [id, targetDir, ...extra] = positional
  if (extra.length > 0) throw new Error(`unexpected argument for ui ${action}: ${extra[0]}`)
  if (id === undefined) throw new Error(`ui ${action} requires an item id`)
  if (UI_TARGET_ACTIONS.has(action) && targetDir === undefined) throw new Error(`ui ${action} requires a target directory`)
  return {
    ...flags,
    kind: 'ui',
    action,
    id,
    ...(targetDir === undefined ? {} : { targetDir }),
    ...(surface === undefined ? {} : { surface }),
    ...(registryDir === undefined ? {} : { registryDir }),
  }
}

const HOST_COMMANDS = new Set<AcrylHostCommand>(['tui', 'gui', 'web'])

const PLUGIN_ACTIONS = new Set<AcrylPluginAction>([
  'list',
  'enable',
  'disable',
  'doctor',
  'add',
  'remove',
])

/** Actions that name exactly one plugin. */
const PLUGIN_TARGET_ACTIONS = new Set<AcrylPluginAction>(['enable', 'disable', 'add', 'remove'])

/** What a target action's argument is called, for error messages a user reads. */
function targetNoun(action: AcrylPluginAction): string {
  return action === 'add' || action === 'remove' ? 'package name' : 'plugin id'
}

function hostCommand(value: string): AcrylHostCommand | undefined {
  return HOST_COMMANDS.has(value as AcrylHostCommand)
    ? value as AcrylHostCommand
    : undefined
}

function pluginAction(value: string): AcrylPluginAction | undefined {
  return PLUGIN_ACTIONS.has(value as AcrylPluginAction)
    ? value as AcrylPluginAction
    : undefined
}

/** `acryl plugin …` behind `acryl tui`: the command word plus its own arguments. */
function parsePluginInvocation(
  rest: readonly string[],
  flags: AcrylInvocationFlags & { readonly resumeSessionId?: string },
): AcrylPluginInvocation {
  const [rawAction, entryId, ...extra] = rest
  if (flags.resumeSessionId !== undefined) {
    throw new Error('--resume applies to the tui command, not to plugin commands')
  }
  // `acryl plugin` alone lists, the same way `git remote` does.
  const action = rawAction === undefined ? 'list' : pluginAction(rawAction)
  if (action === undefined) {
    throw new Error(`unknown plugin action: ${rawAction}`)
  }
  if (extra.length > 0) throw new Error(`unexpected argument for plugin ${action}: ${extra[0]}`)
  if (PLUGIN_TARGET_ACTIONS.has(action)) {
    if (entryId === undefined) throw new Error(`plugin ${action} requires a ${targetNoun(action)}`)
    return { ...flags, kind: 'plugin', action, entryId }
  }
  if (entryId !== undefined) throw new Error(`plugin ${action} takes no argument`)
  return { ...flags, kind: 'plugin', action }
}

const CONTROL_ACTIONS: ReadonlySet<AcrylControlAction> = new Set(['list', 'snapshot', 'click', 'type', 'select', 'press', 'scroll', 'wait', 'worker'])
const WORKER_OPS: ReadonlySet<AcrylWorkerOp> = new Set(['list', 'attach', 'send', 'cancel', 'stop'])
const CONTROL_VALUED: ReadonlySet<string> = new Set(['--app', '--ref', '--text', '--option', '--key', '--direction', '--amount', '--cursor', '--max-nodes', '--role', '--name', '--timeout-ms', '--cwd', '--worker', '--provider', '--resume'])
const CONTROL_FLAGS: ReadonlySet<string> = new Set(['--submit', '--no-clear', '--gone'])

function parseControlInvocation(args: readonly string[]): AcrylControlInvocation {
  const action = args[0]
  if (action === undefined || !CONTROL_ACTIONS.has(action as AcrylControlAction)) {
    throw new Error(`usage: acryl control <${[...CONTROL_ACTIONS].join('|')}> [--app <id>] [options] [--json]`)
  }
  let workerOp: AcrylWorkerOp | undefined
  if (action === 'worker') {
    workerOp = args[1] as AcrylWorkerOp | undefined
    if (workerOp === undefined || !WORKER_OPS.has(workerOp)) throw new Error(`usage: acryl control worker <${[...WORKER_OPS].join('|')}> [--app <id>] [--worker <id>] [--cwd <folder>] [--text <t>] [--json]`)
  }
  const { values, set, json } = parseAppOptions(args.slice(action === 'worker' ? 2 : 1), CONTROL_VALUED, CONTROL_FLAGS)
  const int = (flag: string, label: string): number | undefined => {
    const raw = values.get(flag)
    if (raw === undefined) return undefined
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} must be a non-negative integer (${label})`)
    return value
  }
  const direction = values.get('--direction')
  if (direction !== undefined && direction !== 'up' && direction !== 'down' && direction !== 'left' && direction !== 'right') {
    throw new Error('--direction must be up, down, left or right')
  }
  return {
    kind: 'control',
    action: action as AcrylControlAction,
    json, version: false, help: false,
    ...(workerOp === undefined ? {} : { workerOp }),
    ...(values.get('--cwd') === undefined ? {} : { cwd: values.get('--cwd') }),
    ...(values.get('--worker') === undefined ? {} : { worker: values.get('--worker') }),
    ...(values.get('--provider') === undefined ? {} : { provider: values.get('--provider') }),
    ...(values.get('--resume') === undefined ? {} : { resume: values.get('--resume') }),
    ...(values.get('--app') === undefined ? {} : { app: values.get('--app') }),
    ...(values.get('--ref') === undefined ? {} : { ref: values.get('--ref') }),
    ...(values.get('--text') === undefined ? {} : { text: values.get('--text') }),
    ...(values.get('--option') === undefined ? {} : { option: values.get('--option') }),
    ...(values.get('--key') === undefined ? {} : { key: values.get('--key') }),
    ...(direction === undefined ? {} : { direction }),
    ...(int('--amount', 'amount') === undefined ? {} : { amount: int('--amount', 'amount') }),
    ...(set.has('--submit') ? { submit: true } : {}),
    ...(set.has('--no-clear') ? { noClear: true } : {}),
    ...(int('--cursor', 'cursor') === undefined ? {} : { cursor: int('--cursor', 'cursor') }),
    ...(int('--max-nodes', 'maxNodes') === undefined ? {} : { maxNodes: int('--max-nodes', 'maxNodes') }),
    ...(values.get('--role') === undefined ? {} : { role: values.get('--role') }),
    ...(values.get('--name') === undefined ? {} : { name: values.get('--name') }),
    ...(set.has('--gone') ? { gone: true } : {}),
    ...(int('--timeout-ms', 'timeoutMs') === undefined ? {} : { timeoutMs: int('--timeout-ms', 'timeoutMs') }),
  }
}

export function parseAcrylArgs(args: readonly string[]): AcrylInvocation {
  if (args[0] === 'new') return parseNewInvocation(args.slice(1))
  if (args[0] === 'save') return parseSaveInvocation(args.slice(1))
  if (args[0] === 'remote') return parseRemoteInvocation(args.slice(1))
  if (args[0] === 'control') return parseControlInvocation(args.slice(1))
  let profile: string | undefined
  let resumeSessionId: string | undefined
  let uiSurface: string | undefined
  let uiRegistryDir: string | undefined
  let home: string | undefined
  let dryRun = false
  let yes = false
  let undo: string | undefined
  const recipes: string[] = []
  let json = false
  let version = false
  let help = false
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined) continue
    if (argument === '--version' || argument === '-v') {
      if (version) throw new Error('--version may be provided only once')
      version = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      if (help) throw new Error('--help may be provided only once')
      help = true
      continue
    }
    if (argument === '--profile') {
      if (profile !== undefined) throw new Error('--profile may be provided only once')
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        throw new Error('--profile requires a value')
      }
      profile = value
      index += 1
      continue
    }
    if (argument === '--resume') {
      if (resumeSessionId !== undefined) throw new Error('--resume may be provided only once')
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        throw new Error('--resume requires a session id')
      }
      resumeSessionId = value
      index += 1
      continue
    }
    if (argument === '--json') {
      if (json) throw new Error('--json may be provided only once')
      json = true
      continue
    }
    if (argument === '--surface') {
      if (uiSurface !== undefined) throw new Error('--surface may be provided only once')
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Error('--surface requires a value')
      uiSurface = value
      index += 1
      continue
    }
    if (argument === '--registry') {
      if (uiRegistryDir !== undefined) throw new Error('--registry may be provided only once')
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Error('--registry requires a value')
      uiRegistryDir = value
      index += 1
      continue
    }
    if (argument === '--home' || argument === '--recipe' || argument === '--undo') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('--') || value.trim() === '') throw new Error(`${argument} requires a value`)
      if (argument === '--home') { if (home !== undefined) throw new Error('--home may be provided only once'); home = value }
      else if (argument === '--undo') { if (undo !== undefined) throw new Error('--undo may be provided only once'); undo = value }
      else recipes.push(value)
      index += 1
      continue
    }
    if (argument === '--dry-run') { dryRun = true; continue }
    if (argument === '--yes') { yes = true; continue }
    if (argument.startsWith('-')) throw new Error(`unknown option: ${argument}`)
    positional.push(argument)
  }

  const flags = {
    json,
    version,
    help,
    ...(profile === undefined ? {} : { profile }),
  }
  const [command, ...rest] = positional
  const rescueOnly = (name: string): void => {
    if (resumeSessionId !== undefined) throw new Error(`--resume applies to the tui command, not to ${name}`)
    if (rest.length > 0) throw new Error(`unexpected argument for ${name}: ${rest[0]}`)
  }
  if (command === 'doctor') {
    rescueOnly('doctor')
    if (dryRun || yes || undo !== undefined || recipes.length > 0) throw new Error('doctor takes no repair options; use `acryl repair`')
    return { ...flags, kind: 'doctor', ...(home === undefined ? {} : { home }) }
  }
  if (command === 'repair') {
    rescueOnly('repair')
    if (undo !== undefined && (dryRun || yes || recipes.length > 0)) throw new Error('--undo cannot be combined with other repair options')
    if (yes && recipes.length === 0 && undo === undefined) throw new Error('--yes needs the recipes named with --recipe, so an unattended run only does what you listed')
    return { ...flags, kind: 'repair', dryRun, yes, recipes, ...(home === undefined ? {} : { home }), ...(undo === undefined ? {} : { undo }) }
  }
  if (home !== undefined || dryRun || yes || undo !== undefined || recipes.length > 0) {
    throw new Error('--home, --dry-run, --yes, --recipe and --undo belong to `acryl doctor` and `acryl repair`')
  }
  if (command === 'plugin') {
    return parsePluginInvocation(rest, {
      ...flags,
      ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
    })
  }
  if (command === 'ui') {
    if (resumeSessionId !== undefined) throw new Error('--resume applies to the tui command, not to ui commands')
    return parseUiInvocation(rest, flags, uiSurface, uiRegistryDir)
  }
  const surface = command === undefined ? 'tui' : hostCommand(command)
  if (surface === undefined) throw new Error(`unknown command: ${command}`)
  if (rest.length > 0) throw new Error(`unexpected argument for ${surface}: ${rest[0]}`)
  return {
    ...flags,
    kind: 'surface',
    command: surface,
    ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
  }
}
