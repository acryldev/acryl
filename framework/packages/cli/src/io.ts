import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { packageManagerInvocation } from './spawn'

/** Everything the CLI touches outside the filesystem. Tests pass their own. */
export interface Io {
  stdout: { write(text: string): unknown }
  stderr: { write(text: string): unknown }
  cwd: string
  /** Ask one question; `undefined` when there is no terminal to ask on. */
  ask: ((question: string) => Promise<string>) | undefined
  /** Install dependencies in a directory; resolves to the exit code. */
  install(directory: string): Promise<number>
}

/** The real terminal and `npm install`. */
export function processIo(): Io {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    cwd: process.cwd(),
    ask: interactive
      ? async (question) => {
          const rl = createInterface({ input: process.stdin, output: process.stdout })
          try {
            return await rl.question(question)
          } finally {
            rl.close()
          }
        }
      : undefined,
    install: (directory) =>
      new Promise((done) => {
        const { file, args } = packageManagerInvocation('npm', ['install'])
        const child = spawn(file, args, { cwd: directory, stdio: 'inherit' })
        child.on('error', () => done(1))
        child.on('exit', (code) => done(code ?? 1))
      }),
  }
}
