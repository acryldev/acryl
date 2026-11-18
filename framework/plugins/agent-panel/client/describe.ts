// One line for a tool event of the panel's conversation: what the tool is doing, not only its name. A coding agent started in the folder reports its own log (`{ tool: 'codex', info }`):
// its bookkeeping is dropped and its command or sentence is kept. The app's own agent reports a call (`{ tool, input, result | error }`): the name and a short form of the arguments.

const MAX = 160

const clip = (text: string): string => (text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text)

/** A shell command as the agent's log writes it: `/bin/zsh -lc 'npm test' in /path/to/app` becomes `npm test`. */
function commandOf(line: string): string {
  const withoutCwd = line.replace(/ in \/\S+\s*$/u, '')
  const wrapped = /^(?:\/\S*\/)?(?:ba|z|da)?sh -l?c (['"])([\s\S]*)\1$/u.exec(withoutCwd.trim())
  return wrapped?.[2] ?? withoutCwd.trim()
}

/** @returns the line to show, or `undefined` when the event says nothing worth a line (a hook ran, a token count). */
export function describeTool(data: Record<string, unknown>): string | undefined {
  const tool = String(data.tool ?? '')
  if (typeof data.info === 'string') {
    const lines = data.info
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line !== '' &&
          !/^hook:/u.test(line) &&
          !/^tokens used/u.test(line) &&
          !/^[\d,]+$/u.test(line),
      )
    if (lines.length === 0) return undefined
    const [first = '', second = ''] = lines
    if (first === 'exec') return second === '' ? undefined : `${tool}: $ ${clip(commandOf(second))}`
    // The output of a command that ran: only a failure is worth a line.
    if (/^succeeded in /u.test(first)) return undefined
    if (/^exited \d+/u.test(first)) return `${tool}: ${clip(first.replace(/:$/u, ''))}`
    return `${tool}: ${clip(lines.join(' '))}`
  }
  const input =
    data.input === undefined ||
    (typeof data.input === 'object' && data.input !== null && Object.keys(data.input).length === 0)
      ? ''
      : ` ${clip(JSON.stringify(data.input))}`
  const failed = data.error ? ` failed: ${clip(String(data.error))}` : ''
  return `${tool}${input}${failed}`
}

/** What an act touched, from its result: the door's chat tool answers `done: link "My tasks" (detail); look again before the next act`, its verb `{ target }`. */
function targetOf(result: unknown): { role?: string; name?: string } {
  if (typeof result === 'string') {
    const match = /^done: (\S+) "(.*)"(?: \(.*\))?; look again/u.exec(result)
    return match === null ? {} : { role: match[1], name: match[2] }
  }
  if (typeof result !== 'object' || result === null) return {}
  const target = (result as { target?: unknown }).target
  if (typeof target !== 'object' || target === null) return {}
  const { role, name } = target as { role?: unknown; name?: unknown }
  return {
    ...(typeof role === 'string' ? { role } : {}),
    ...(typeof name === 'string' ? { name } : {}),
  }
}

/**
 * The Assistant's step on the page, as the person reads it under the answer: what it did, named the way the page names it. `ui.open("My tasks")`,
 * `ui.fill("Due", "This week")`, `ui.click("Save")`, `ui.press("Enter")`. A look changes nothing, so it is left out unless it failed. The control's name comes from the
 * act's result (the page says what it acted on); the ref is the fallback.
 */
export function describePageStep(data: Record<string, unknown>): string | undefined {
  const failed = data.error ? ' failed' : ''
  if (data.tool === 'door_look') return failed === '' ? undefined : 'ui.look() failed'
  if (data.tool !== 'door_act') return describeTool(data)
  const input = (typeof data.input === 'object' && data.input !== null ? data.input : {}) as Record<
    string,
    unknown
  >
  const target = targetOf(data.result)
  const quoted = (value: unknown): string => JSON.stringify(clip(String(value ?? '')))
  const op = typeof input.op === 'string' ? input.op : 'act'
  const named =
    typeof target.name === 'string' && target.name !== ''
      ? quoted(target.name)
      : typeof input.ref === 'string'
        ? input.ref
        : undefined
  const [verb, args]: [string, readonly (string | undefined)[]] =
    op === 'navigate'
      ? ['open', [quoted(input.path)]]
      : op === 'click' && target.role === 'link'
        ? ['open', [named]]
        : op === 'type'
          ? ['fill', [named, quoted(input.text)]]
          : op === 'select'
            ? ['fill', [named, quoted(input.option)]]
            : op === 'press'
              ? ['press', [quoted(input.key)]]
              : op === 'scroll'
                ? ['scroll', [input.direction === undefined ? undefined : quoted(input.direction)]]
                : op === 'wait'
                  ? ['wait', [quoted(input.text ?? input.name)]]
                  : [op, [named]]
  return `ui.${verb}(${args.filter((arg) => arg !== undefined).join(', ')})${failed}`
}
