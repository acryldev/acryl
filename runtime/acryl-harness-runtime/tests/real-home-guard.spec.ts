/**
 * The gate's real-home guard (`scripts/real-home-guard.mjs`) excuses exactly the apps that are running: their homes are left out because a live app
 * writes its own home all the time (the development app's logs, the installed app's settings), and the guard must not fail the gate for that. A home
 * with no live entry is still watched, and so is a Registry entry whose process is gone. Each case runs the real script against a throwaway OS home,
 * with a command that writes into it, and checks the exit code and the report.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const guard = fileURLToPath(new URL('../../../scripts/real-home-guard.mjs', import.meta.url))
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const step of cleanups.splice(0).reverse()) step()
})

/** A throwaway OS home, with the folder a test would write. */
function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'real-home-guard-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** A Registry entry as `announce` writes it: `~/.acryl-instances/.running/<id>.json`. */
function announce(osHome: string, entry: { id: string, name: string, home: string, pid: number }): void {
  const dir = join(osHome, '.acryl-instances', '.running')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${entry.id}.json`), JSON.stringify({ ...entry, surface: 'web', since: new Date().toISOString() }))
}

/** A process that stays alive while the guard runs, so its Registry entry reads as live; killed afterwards. */
function liveProcess(): number {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  cleanups.push(() => child.kill('SIGKILL'))
  return child.pid!
}

/** Writes a file under an app home inside the throwaway OS home, as a running app would. */
function write(file: string): string[] {
  return ['-e', `require('node:fs').mkdirSync(require('node:path').dirname(${JSON.stringify(file)}), { recursive: true }); require('node:fs').writeFileSync(${JSON.stringify(file)}, 'x')`]
}

function run(osHome: string, command: string[]): { status: number | null, output: string } {
  const result = spawnSync(process.execPath, [guard, '--', process.execPath, ...command], {
    env: { ...process.env, HOME: osHome, USERPROFILE: osHome },
    encoding: 'utf8',
  })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('the real-home guard and live apps', () => {
  it('leaves out the home of a live app, says so, and passes when that app writes its own home', () => {
    const osHome = home()
    const appHome = join(osHome, '.acryl-dev')
    const pid = liveProcess()
    announce(osHome, { id: 'acryl-dev', name: 'ACRYL Development', home: appHome, pid })
    const { status, output } = run(osHome, write(join(appHome, 'logs', 'session.log')))
    expect(output).toContain('skipped ~/.acryl-dev: app ACRYL Development pid')
    expect(status).toBe(0)
  })

  it('fails a write into a home with no live entry, and names the file', () => {
    const osHome = home()
    const appHome = join(osHome, '.acryl-worktrees', 'someone-else')
    const { status, output } = run(osHome, write(join(appHome, 'not-a-live-app.log')))
    expect(output).toContain('not-a-live-app.log')
    expect(status).toBe(1)
  })

  it('does not excuse a Registry entry whose process is gone', () => {
    const osHome = home()
    const appHome = join(osHome, '.acryl-dev')
    announce(osHome, { id: 'stale', name: 'Stale App', home: appHome, pid: 2_147_483_600 })
    const { status, output } = run(osHome, write(join(appHome, 'stale-write.log')))
    expect(output).not.toContain('skipped ~/.acryl-dev')
    expect(output).toContain('stale-write.log')
    expect(status).toBe(1)
  })

  it('always checks ~/.acryl-instances, but lets a live app change its own Registry entry', () => {
    const osHome = home()
    const pid = liveProcess()
    announce(osHome, { id: 'mine', name: 'My App', home: join(osHome, '.acryl-dev'), pid })
    const ownEntry = join(osHome, '.acryl-instances', '.running', 'mine.json')
    const rewriteOwn = ['-e', `require('node:fs').writeFileSync(${JSON.stringify(ownEntry)}, '{"pid":${String(pid)},"home":"x"}')`]
    expect(run(osHome, rewriteOwn).status).toBe(0)

    const foreignEntry = join(osHome, '.acryl-instances', '.running', 'other.json')
    const addForeign = write(foreignEntry)
    const foreign = run(osHome, addForeign)
    expect(foreign.status).toBe(1)
    expect(foreign.output).toContain('other.json')
  })
})
