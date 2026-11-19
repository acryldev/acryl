/**
 * The sandbox (`ctx.sandbox`): run code you do not trust, such as a tool an agent just wrote, without giving it the host.
 *
 * Each call starts a fresh Node child process with the permission model on (`node --permission`):
 *  - it may read only the tool's own folder (and the runner); every other file read is denied;
 *  - it may not write files, start child processes or workers, load native addons, or use the inspector;
 *  - it gets an empty environment, so no keys or paths leak in;
 *  - it is killed after a time limit, and capped in memory and in output size.
 *
 * What this does NOT do: Node 24 has no network permission, so a tool can still reach the network. Where that matters (a hosted tenant),
 * restrict egress outside the process. The calls are independent: nothing a tool does survives into the next call.
 */
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

export interface SandboxOptions {
  /** Extra folders the tool may read, besides its own. */
  read?: readonly string[]
  /** Wall-clock limit. Default 5000. */
  timeoutMs?: number
  /** Heap limit in MB. Default 128. */
  memoryMb?: number
  /** Largest output kept, in bytes. Default 1 MiB. */
  maxOutputBytes?: number
}

export type SandboxResult =
  | { readonly ok: true; readonly output: unknown }
  | {
      readonly ok: false
      readonly kind: 'denied' | 'timeout' | 'crash' | 'error' | 'output'
      readonly error: string
    }

export interface Sandbox {
  /** Run `entry` (a file that exports `run(input)`) with `input`, as described above. Never throws: failures are results. */
  run(entry: string, input: unknown, options?: SandboxOptions): Promise<SandboxResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sandbox: Sandbox
  }
}

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'runner.mjs')
const MARK = '\n@@acrylblends-result@@'

export const sandbox: Sandbox = {
  run(entry, input, options = {}) {
    // The permission system compares real paths (on macOS /var is /private/var), so grant and import real paths.
    try {
      entry = realpathSync(entry)
    } catch {
      return Promise.resolve({ ok: false, kind: 'error', error: `${entry} does not exist` })
    }
    const timeoutMs = options.timeoutMs ?? 5000
    const maxOutput = options.maxOutputBytes ?? 1024 * 1024
    const reads = [dirname(entry), ...(options.read ?? [])].map((path) => {
      try {
        return realpathSync(path)
      } catch {
        return path
      }
    })
    return new Promise((done) => {
      const child = spawn(
        process.execPath,
        [
          '--permission',
          `--allow-fs-read=${RUNNER}`,
          ...reads.map((path) => `--allow-fs-read=${path}`),
          '--disallow-code-generation-from-strings',
          `--max-old-space-size=${options.memoryMb ?? 128}`,
          RUNNER,
          pathToFileURL(entry).href,
        ],
        { env: {}, cwd: dirname(entry), stdio: ['pipe', 'pipe', 'pipe'] },
      )
      let out = ''
      let err = ''
      let finished = false
      const finish = (result: SandboxResult) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        child.kill('SIGKILL')
        done(result)
      }
      const timer = setTimeout(
        () => finish({ ok: false, kind: 'timeout', error: `no result within ${timeoutMs} ms` }),
        timeoutMs,
      )
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk
        if (out.length > maxOutput)
          finish({ ok: false, kind: 'output', error: `more than ${maxOutput} bytes of output` })
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (err.length < 4000) err += chunk
      })
      child.on('error', (error) => finish({ ok: false, kind: 'crash', error: error.message }))
      child.on('close', (code) => {
        const at = out.lastIndexOf(MARK)
        if (at === -1) {
          const denied = /ERR_ACCESS_DENIED/.test(err)
          return finish({
            ok: false,
            kind: denied ? 'denied' : 'crash',
            error: (
              err
                .trim()
                .split('\n')
                .find((line) => /Error/.test(line)) ?? `exited with ${code}`
            ).slice(0, 300),
          })
        }
        let parsed: { ok: boolean; output?: unknown; error?: string; code?: string }
        try {
          parsed = JSON.parse(out.slice(at + MARK.length))
        } catch {
          return finish({
            ok: false,
            kind: 'crash',
            error: 'the tool returned something that is not JSON',
          })
        }
        if (parsed.ok) return finish({ ok: true, output: parsed.output ?? null })
        finish({
          ok: false,
          kind: parsed.code === 'ERR_ACCESS_DENIED' ? 'denied' : 'error',
          error: parsed.error ?? 'the tool failed',
        })
      })
      child.stdin.on('error', () => undefined)
      child.stdin.end(JSON.stringify({ input }))
    })
  },
}

/** The plugin: provides `ctx.sandbox`. */
export const sandboxPlugin = {
  name: 'sandbox',
  apply(ctx: Context) {
    ctx.provide('sandbox', sandbox)
  },
}
