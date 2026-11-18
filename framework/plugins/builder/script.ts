/**
 * The builder's commands for the offline scripted model, so the whole build-install-update-remove loop runs without a network.
 * A real model reads the tool descriptions instead and decides for itself.
 *
 *   create route <name> <path> <text...>   write a plugin that answers GET <path> with { text }, then install it
 *   update route <name> <path> <text...>   the same, over the existing plugin
 *   break plugin <name>                     write a version whose apply throws, then try to install it
 *   remove plugin <name>                    remove it and delete its folder
 *   create tool <name> <factor>             write a sandboxed tool that multiplies input.n by factor (its example is its check), install it
 *   run tool <name> <n>                     call an installed tool
 *   spy tool <name>                         write a tool that tries to read /etc/hosts, to show the sandbox refusing it
 *   list plugins                            list installed extensions
 *   package plugin <name>                   make it a standalone package other apps can add
 */
import type { Rule, Step } from '../agent/index.ts'

const PATH = /^\/[a-z0-9/-]*$/

export function routeSource(name: string, path: string, text: string): string {
  return `import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

/** Written by the builder: answers GET ${path}, and checks that it does before the install counts. */
export const name = '${name}'
export const inject = ['router']

export function apply(ctx: Context) {
  // The app is mounted through this plugin's context, so the route is removed when the plugin is unloaded.
  ctx.router.route('/', new Acryl().get(${JSON.stringify(path)}, (c) => c.json({ text: ${JSON.stringify(text)} })))
}

export async function check(ctx: Context) {
  const reply = await ctx.router.request(${JSON.stringify(path)})
  if (!reply.ok) throw new Error(\`GET ${path} answered \${reply.status}\`)
}
`
}

export function brokenSource(name: string): string {
  return `export const name = '${name}'

export function apply() {
  throw new Error('${name} refuses to start')
}
`
}

function summary(result: unknown): string {
  const waiting = (result as { stage?: string; name?: string } | undefined)?.stage === 'approval'
  if (waiting) return `${(result as { name: string }).name}: waiting for the owner's approval.`
  const answer = result as {
    ok?: boolean
    name?: string
    action?: string
    state?: string
    errors?: string[]
    restoredPrevious?: boolean
  }
  if (answer?.ok === true && answer.action)
    return `${answer.name}: ${answer.action}, ${answer.state}.`
  if (answer?.ok === true) return `${answer.name}: done.`
  const restored =
    answer?.restoredPrevious === undefined
      ? ''
      : ` Previous version restored: ${String(answer.restoredPrevious)}.`
  return `Refused: ${(answer?.errors ?? ['unknown error']).join('; ')}.${restored}`
}

/** Write, then install, then report. */
function writeThenInstall(
  step: number,
  toolResult: unknown,
  name: string,
  files: Record<string, string>,
): Step {
  if (step === 0) return { tool: 'write_plugin', input: { name, files } }
  if (step === 1) {
    const written = toolResult as { ok?: boolean; error?: string }
    if (written?.ok !== true)
      return { text: `Could not write ${name}: ${written?.error ?? 'unknown error'}` }
    return { tool: 'install_plugin', input: { name } }
  }
  return { text: summary(toolResult) }
}

export function toolFiles(factor: number): Record<string, string> {
  return {
    'index.ts': `/** Written by the builder: multiplies input.n by ${factor}. Runs only in the sandbox. */\nexport function run(input: { n: number }) {\n  return { n: input.n * ${factor} }\n}\n`,
    'tool.json': JSON.stringify({
      description: `Multiply a number by ${factor}: input { n }.`,
      examples: [{ input: { n: 2 }, output: { n: 2 * factor } }],
    }),
  }
}

export function spyFiles(): Record<string, string> {
  return {
    'index.ts':
      "import { readFileSync } from 'node:fs'\nexport function run() {\n  return readFileSync('/etc/hosts', 'utf8').length\n}\n",
    'tool.json': JSON.stringify({
      description: 'Reads a file it should not.',
      examples: [{ input: {}, output: 1 }],
    }),
  }
}

export const builderRules: Rule = ({ question, step, toolResult }) => {
  const words = question.trim().split(/\s+/)
  const [verb, noun, name, path, ...text] = words
  if (
    (verb === 'create' || verb === 'update') &&
    noun === 'route' &&
    name &&
    path &&
    PATH.test(path)
  ) {
    return writeThenInstall(step, toolResult, name, {
      'index.ts': routeSource(name, path, text.join(' ') || name),
    })
  }
  if (verb === 'create' && noun === 'tool' && name && path && Number.isFinite(Number(path))) {
    return writeThenInstall(step, toolResult, name, toolFiles(Number(path)))
  }
  if (verb === 'spy' && noun === 'tool' && name)
    return writeThenInstall(step, toolResult, name, spyFiles())
  if (verb === 'run' && noun === 'tool' && name && path && Number.isFinite(Number(path))) {
    return step === 0
      ? { tool: name, input: { n: Number(path) } }
      : { text: JSON.stringify(toolResult) }
  }
  if (verb === 'break' && noun === 'plugin' && name)
    return writeThenInstall(step, toolResult, name, { 'index.ts': brokenSource(name) })
  if (verb === 'remove' && noun === 'plugin' && name) {
    return step === 0
      ? { tool: 'remove_plugin', input: { name, deleteSource: true } }
      : { text: summary(toolResult) }
  }
  if (verb === 'package' && noun === 'plugin' && name) {
    if (step === 0) return { tool: 'package_plugin', input: { name } }
    const packaged = toolResult as { ok?: boolean; dir?: string; error?: string }
    return {
      text: packaged?.ok
        ? `${name}: packaged in ${packaged.dir}.`
        : `Could not package ${name}: ${packaged?.error ?? 'unknown error'}`,
    }
  }
  if (verb === 'list' && noun === 'plugins') {
    if (step === 0) return { tool: 'list_plugins', input: {} }
    const installed =
      (toolResult as { installed?: Array<{ name: string; state: string }> })?.installed ?? []
    return {
      text: installed.length
        ? installed.map((entry) => `${entry.name} (${entry.state})`).join(', ')
        : 'No plugins installed.',
    }
  }
  return undefined
}
