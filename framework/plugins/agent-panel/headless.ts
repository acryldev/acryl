/** The panel's own drivers, all `chat`: the app's agent, and the coding agents (`claude`, `codex`, `pi`) started headless in the app folder. */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { personHome } from '../instance/storage.ts'
import type { ChatDriver, ChatEvent } from './drivers.ts'
import { resolveLaunch } from './launch.ts'

export type HeadlessName = 'claude' | 'codex' | 'pi'

/** The command line of each coding agent started headless in the app folder (the same ones the product test uses). */
export function command(
  driver: HeadlessName,
  message: string,
  root: string,
): { file: string; args: string[] } {
  switch (driver) {
    case 'claude':
      return {
        file: 'claude',
        args: [
          '-p',
          message,
          '--permission-mode',
          'acceptEdits',
          '--allowedTools',
          'Read,Edit,Write,Glob,Grep,Bash(npm *),Bash(npx *),Bash(node *),Bash(.acryl/bin/acryl *),Bash(curl *)',
        ],
      }
    case 'codex':
      return {
        file: 'codex',
        args: [
          'exec',
          '--skip-git-repo-check',
          '-s',
          'workspace-write',
          '-c',
          'sandbox_workspace_write.network_access=true',
          '-C',
          root,
          message,
        ],
      }
    case 'pi':
      return {
        file: 'pi',
        args: [
          '-p',
          message,
          '--provider',
          'deepseek',
          '--model',
          'deepseek-v4-pro',
          '--no-session',
        ],
      }
  }
}

/** Stop a program and what it started: Windows has no process groups, so the tree goes by its root (`SIGTERM` there ends only the one process). */
function stopProgram(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  child.kill('SIGTERM')
}

export function onPath(program: string): boolean {
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [program], {
    encoding: 'utf8',
  })
  return found.status === 0
}

/** Whether pi can reach DeepSeek: the key in the environment, or the one pi stored for itself when its owner logged in (`~/.pi/agent/auth.json`, a `deepseek` entry). */
export function piHasDeepseekKey(
  env: NodeJS.ProcessEnv = process.env,
  home: string = personHome(env),
): boolean {
  if (env.DEEPSEEK_API_KEY) return true
  try {
    const stored = JSON.parse(
      readFileSync(
        join(env.PI_CODING_AGENT_DIR ?? join(home, '.pi', 'agent'), 'auth.json'),
        'utf8',
      ),
    ) as Record<string, { key?: unknown } | undefined>
    return typeof stored.deepseek?.key === 'string' && stored.deepseek.key !== ''
  } catch {
    return false
  }
}

/** The headless programs this machine can offer: installed (an executable on the PATH; a wrapper function around it is fine) and, for pi, able to reach its model. */
export function availableHeadless(wanted?: readonly HeadlessName[]): HeadlessName[] {
  const found: HeadlessName[] = []
  for (const driver of wanted ?? (['claude', 'codex', 'pi'] as const)) {
    if (driver === 'pi' && !piHasDeepseekKey()) continue
    if (!onPath(driver)) continue
    // On Windows an npm-installed program is offered only when its script can be started directly: a driver that is listed must start.
    if ('error' in resolveLaunch(driver, [])) continue
    found.push(driver)
  }
  return found
}

/** The app's own agent as a chat driver: its tool calls, then its answer. Aborting the signal cancels the run. */
export function agentDriver(ctx: Context): ChatDriver {
  return {
    kind: 'chat',
    name: 'agent',
    async *start({ message, signal, page }) {
      const result = await ctx.agent.run(message, {
        signal,
        ...(page === undefined ? {} : { page }),
      })
      for (const call of result.trace)
        yield {
          event: 'tool',
          data: {
            tool: call.tool,
            input: call.input,
            ...(call.error ? { error: call.error } : { result: call.result }),
          },
        }
      yield {
        event: 'text',
        data: {
          text:
            result.status === 'completed'
              ? result.output
              : result.status === 'cancelled'
                ? 'The run was cancelled.'
                : `The run stopped after ${result.steps} steps without an answer.`,
        },
      }
    },
  }
}

/** A coding agent run headless in the app folder: its stdout is the answer, its stderr the tool lines. Aborting the signal ends the program. */
export function headlessDriver(name: HeadlessName, root: string): ChatDriver {
  return {
    kind: 'chat',
    name,
    async *start({ message, signal }) {
      const wanted = command(name, message, root)
      const launch = resolveLaunch(wanted.file, wanted.args)
      if ('error' in launch) {
        yield { event: 'error', data: { message: launch.error } }
        return
      }
      const child = spawn(launch.file, launch.args, {
        cwd: root,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const queue: ChatEvent[] = []
      let wake: (() => void) | undefined
      let ended = false
      const push = (event: ChatEvent): void => {
        queue.push(event)
        wake?.()
      }
      signal.addEventListener('abort', () => stopProgram(child), { once: true })
      child.stdout.on('data', (chunk: Buffer) =>
        push({ event: 'text', data: { text: chunk.toString() } }),
      )
      child.stderr.on('data', (chunk: Buffer) =>
        push({ event: 'tool', data: { tool: name, info: chunk.toString().slice(0, 500) } }),
      )
      child.on('error', (cause) => {
        ended = true
        push({
          event: 'error',
          data: { message: `${name} could not be started: ${cause.message}` },
        })
      })
      child.on('exit', (code) => {
        ended = true
        if (code !== 0 && !signal.aborted)
          push({ event: 'error', data: { message: `${name} ended with exit code ${code ?? 1}` } })
        else wake?.()
      })
      try {
        for (;;) {
          const next = queue.shift()
          if (next) yield next
          else if (ended) return
          else await new Promise<void>((resolve) => (wake = resolve))
        }
      } finally {
        if (child.exitCode === null) stopProgram(child)
      }
    },
  }
}

/**
 * Why a driver name cannot be used to ask a question, in a sentence: it is a terminal (picked in the panel, not asked over `/ask`), it is a coding agent that is not installed or not
 * able to start, or pi without a key to reach its model. Nothing when the name is not one of the headless agents.
 */
export function whyNotChat(
  name: string,
  kind: 'chat' | 'terminal' | undefined,
): string | undefined {
  if (kind === 'terminal')
    return `"${name}" is a terminal driver: pick it in the panel to open its terminal; /ask runs the chat drivers`
  if (name !== 'claude' && name !== 'codex' && name !== 'pi') return undefined
  if (!onPath(name))
    return `${name} was not found on the PATH of the app, so the panel cannot start it`
  const launch = resolveLaunch(name, [])
  if ('error' in launch) return launch.error
  if (name === 'pi' && !piHasDeepseekKey())
    return 'pi needs a DeepSeek key: set DEEPSEEK_API_KEY in the environment of the app, or log in with pi once (it keeps the key in ~/.pi/agent/auth.json)'
  return undefined
}
