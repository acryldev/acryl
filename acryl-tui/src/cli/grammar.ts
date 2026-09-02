export type AcrylHostCommand = 'tui' | 'gui' | 'web' | 'acp'

export interface AcrylInvocation {
  readonly command: AcrylHostCommand
  readonly json: boolean
  readonly version: boolean
  readonly help: boolean
  readonly profile?: string
  readonly resumeSessionId?: string
}

const HOST_COMMANDS = new Set<AcrylHostCommand>(['tui', 'gui', 'web', 'acp'])

function hostCommand(value: string): AcrylHostCommand | undefined {
  return HOST_COMMANDS.has(value as AcrylHostCommand)
    ? value as AcrylHostCommand
    : undefined
}

export function parseAcrylArgs(args: readonly string[]): AcrylInvocation {
  let command: AcrylHostCommand | undefined
  let profile: string | undefined
  let resumeSessionId: string | undefined
  let json = false
  let version = false
  let help = false
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
    const parsed = hostCommand(argument)
    if (command === undefined) {
      if (parsed === undefined) throw new Error(`unknown command: ${argument}`)
      command = parsed
      continue
    }
    throw new Error(`unexpected argument for ${command}: ${argument}`)
  }
  const resolvedCommand = command ?? 'tui'
  if (!version && !help && profile === undefined && resumeSessionId === undefined) {
    return { command: resolvedCommand, json, version, help }
  }
  return {
    command: resolvedCommand,
    json,
    version,
    help,
    ...(profile === undefined ? {} : { profile }),
    ...(resumeSessionId === undefined ? {} : { resumeSessionId }),
  }
}
