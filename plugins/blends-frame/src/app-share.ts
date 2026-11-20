/**
 * Share the whole app to GitHub from Settings > Share, through the app's own share command (`plugins/save/share-cli.ts`, the save plugin): the
 * same command `npm run share` and ACRYL Control Center's Share run, so the rules (a plan first, sent only on the person's yes, refused on a
 * secret, visibility kept in blend.yaml) live in one place. The command runs on the Node.js this host runs on (inside a desktop product that is
 * Electron's, as Node).
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type AppSharePlanView, type AppShareRequest, type AppSharedView, parseAppSharePlan } from './contract.ts'

export const SHARE_COMMAND = join('plugins', 'save', 'share-cli.ts')

/** A share the app refused, in its own words (not signed in, a secret in a file, the app changed since the plan). */
export class AppShareRefused extends Error {}

export interface AppSharePort {
  plan(request: AppShareRequest): Promise<AppSharePlanView>
  share(request: AppShareRequest, confirmed: AppSharePlanView): Promise<AppSharedView>
}

type Run = (args: readonly string[]) => Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }>

function runCommand(root: string, env: NodeJS.ProcessEnv): Run {
  return args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SHARE_COMMAND, ...args], { cwd: root, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', code => { resolve({ code, stdout, stderr }) })
  })
}

/** The last line of the command's output that is a JSON object, or undefined. */
function lastJson(text: string): Record<string, unknown> | undefined {
  for (const line of text.trim().split(/\r?\n/u).reverse()) {
    try {
      const value: unknown = JSON.parse(line)
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
    } catch {
      // not a JSON line
    }
  }
  return undefined
}

const requestArgs = (request: AppShareRequest): string[] => [
  ...(request.owner === undefined ? [] : ['--owner', request.owner]),
  ...(request.visibility === undefined ? [] : ['--visibility', request.visibility]),
]

export function appShareCommand(root: string, env: NodeJS.ProcessEnv = process.env, run: Run = runCommand(root, env)): AppSharePort {
  const ask = async (args: readonly string[]): Promise<Record<string, unknown>> => {
    if (!existsSync(join(root, SHARE_COMMAND))) {
      throw new AppShareRefused('This app was made before apps could share themselves. Update it (npx acrylblends@latest update), then try again.')
    }
    const result = await run(['--json', ...args])
    const answer = lastJson(result.stdout)
    if (answer?.ok === false) throw new AppShareRefused(`Not shared: ${typeof answer.reason === 'string' ? answer.reason : 'the app refused'}`)
    if (answer === undefined || result.code !== 0) {
      const said = result.stderr.trim().split(/\r?\n/u).at(-1) ?? ''
      throw new Error(`the app's share command ended with ${String(result.code)}${said === '' ? '' : `: ${said}`}`)
    }
    return answer
  }
  return {
    async plan(request) {
      return parseAppSharePlan(await ask(requestArgs(request)))
    },
    async share(request, confirmed) {
      // base64url: on Windows a command can pass through a shell, which would take JSON's quotes.
      const answer = await ask([...requestArgs(request), '--confirm', Buffer.from(JSON.stringify(confirmed), 'utf8').toString('base64url')])
      if (answer.ok !== true || typeof answer.remote !== 'string') throw new Error('the app did not say where it was shared')
      return { remote: answer.remote, created: answer.created === true }
    },
  }
}
