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

export type AcrylInvocation = AcrylSurfaceInvocation | AcrylPluginInvocation

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

export function parseAcrylArgs(args: readonly string[]): AcrylInvocation {
  let profile: string | undefined
  let resumeSessionId: string | undefined
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
  if (command === 'plugin') {
    return parsePluginInvocation(rest, {
      ...flags,
      ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
    })
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
