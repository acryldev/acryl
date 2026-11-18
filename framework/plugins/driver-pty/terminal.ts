/** A terminal driver: a program started in a pseudo-terminal, ended as a whole (the process group on POSIX, the console on Windows). */
import { delimiter, join } from 'node:path'
import type { TerminalDriver, TerminalSession } from '../agent-panel/drivers.ts'
import type { PtySpawn } from './spawn.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Whether any process of the group `pid` leads is still alive. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

let counter = 0

export function terminalDriver(
  name: string,
  program: string,
  args: string[],
  spawn: PtySpawn,
  view: TerminalDriver['view'],
): TerminalDriver {
  return {
    kind: 'terminal',
    name,
    view,
    start({ cwd, env, cols, rows }): TerminalSession {
      // The agent runs `acryl look` without the folder prefix.
      const path = [join(cwd, '.acryl', 'bin'), env.PATH].filter(Boolean).join(delimiter)
      const proc = spawn(program, args, { cwd, env: { ...env, PATH: path }, cols, rows })
      const dataListeners = new Set<(chunk: string) => void>()
      const exitListeners = new Set<(code: number | null) => void>()
      let exited = false
      proc.onData((chunk) => {
        for (const listener of dataListeners) listener(chunk)
      })
      proc.onExit(({ exitCode }) => {
        exited = true
        for (const listener of exitListeners) listener(exitCode)
      })
      const signalGroup = (signal: NodeJS.Signals): void => {
        try {
          process.kill(-proc.pid, signal)
        } catch {
          // The group is already gone.
        }
      }
      const gone = async (ms: number): Promise<boolean> => {
        for (let waited = 0; waited < ms; waited += 25) {
          if (process.platform === 'win32' ? exited : !groupAlive(proc.pid)) return true
          await sleep(25)
        }
        return process.platform === 'win32' ? exited : !groupAlive(proc.pid)
      }
      return {
        id: `${name}-${++counter}`,
        onData(listener) {
          dataListeners.add(listener)
          return () => void dataListeners.delete(listener)
        },
        onExit(listener) {
          exitListeners.add(listener)
          return () => void exitListeners.delete(listener)
        },
        write: (data) => proc.write(data),
        resize: (c, r) => proc.resize(Math.max(1, c), Math.max(1, r)),
        async kill() {
          if (await gone(0)) return
          if (process.platform === 'win32') {
            proc.kill()
            await gone(2000)
            return
          }
          signalGroup('SIGHUP')
          if (await gone(2000)) return
          signalGroup('SIGKILL')
          await gone(2000)
        },
      }
    },
  }
}
