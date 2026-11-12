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
    // Trays the old apps do not write: the pre-T011 hint belongs to ~/.acryl, ~/.acryl-dev and ~/.dsh only.
    expect(output).not.toContain('built before 905a801c')
    expect(status).toBe(1)
  })

  it('reports a write that only happens when the file is missing, as CI found for credentials and workspace storage', () => {
    const osHome = home()
    const file = join(osHome, '.acryl', '.dsh', '.credentials.yaml')
    // The writer that failed CI on 3e373538 created its file only when absent, which a developer machine that already has the file cannot show; an
    // empty home can. The guard reports the creation like any other addition.
    const onlyIfMissing = [
      '-e',
      `const fs = require('node:fs'); if (!fs.existsSync(${JSON.stringify(file)})) { fs.mkdirSync(require('node:path').dirname(${JSON.stringify(file)}), { recursive: true }); fs.writeFileSync(${JSON.stringify(file)}, 'x') }`,
    ]
    const { status, output } = run(osHome, onlyIfMissing)
    expect(output).toContain('.credentials.yaml')
    expect(status).toBe(1)
  })

  it('does not excuse a Registry entry whose process is gone', () => {
    const osHome = home()
    const appHome = join(osHome, '.acryl-dev')
    announce(osHome, { id: 'stale', name: 'Stale App', home: appHome, pid: 2_147_483_600 })
    const { status, output } = run(osHome, write(join(appHome, 'stale-write.log')))
    expect(output).not.toContain('skipped ~/.acryl-dev')
    expect(output).toContain('stale-write.log')
    // An app built before 905a801c (T011) announces nothing, so a change here may be that app, and the failure says what to do about it.
    expect(output).toContain('An ACRYL app built before 905a801c (T011) does not announce itself; if one is running against this home, quit it or run with ACRYL_REAL_HOME_GUARD=off.')
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

/** Keeps `file` open and appends to it, as a long-running database does. */
const holderSource = (file: string): string =>
  `const fs = require('node:fs'); fs.mkdirSync(require('node:path').dirname(${JSON.stringify(file)}), { recursive: true }); const fd = fs.openSync(${JSON.stringify(file)}, 'a'); setInterval(() => fs.writeSync(fd, 'x'), 100)`

/** A process older than the gate that keeps writing `file`. The ages are compared in whole seconds, so it is given more than one. */
async function olderHolder(file: string): Promise<void> {
  const child = spawn(process.execPath, ['-e', holderSource(file)], { stdio: 'ignore' })
  cleanups.push(() => child.kill('SIGKILL'))
  await new Promise(done => setTimeout(done, 2_200))
}

const pause = ['-e', 'setTimeout(() => {}, 1200)']

// lsof and ps -o lstart do not exist on Windows; there the guard excuses nothing, which fails safe.
describe.skipIf(process.platform === 'win32')('the real-home guard and processes older than the gate', () => {
  it('excuses a file only a process older than the gate holds open, and names both', async () => {
    const osHome = home()
    const wal = join(osHome, '.dsh', 'state', 'superagent', 'orchestrator.sqlite-wal')
    await olderHolder(wal)
    const { status, output } = run(osHome, pause)
    expect(output).toMatch(/real-home-guard: excused ~\/\.dsh\/state\/superagent\/orchestrator\.sqlite-wal: held open by pid \d+, older than this gate/)
    expect(status).toBe(0)
  }, 20_000)

  it('still fails what the gate itself wrote while an older process writes beside it', async () => {
    const osHome = home()
    await olderHolder(join(osHome, '.dsh', 'state', 'superagent', 'orchestrator.sqlite-wal'))
    const { status, output } = run(osHome, write(join(osHome, '.dsh', 'state', 'a-test-wrote-this.log')))
    expect(output).toContain('a-test-wrote-this.log')
    expect(status).toBe(1)
  }, 20_000)

  it('does not excuse a writer the gate started and left running', () => {
    const osHome = home()
    const file = join(osHome, '.dsh', 'state', 'leaked.log')
    const leak = ['-e', `const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', ${JSON.stringify(holderSource(file))}], { stdio: 'ignore', detached: true }); c.unref(); console.log('leaked-pid=' + c.pid); setTimeout(() => {}, 1200)`]
    const { status, output } = run(osHome, leak)
    const pid = Number(/leaked-pid=(\d+)/u.exec(output)?.[1])
    if (pid > 0) cleanups.push(() => process.kill(pid, 'SIGKILL'))
    expect(output).toContain('leaked.log')
    expect(status).toBe(1)
  }, 20_000)

  it('excuses only a database file under ~/.dsh/state, so an older holder cannot excuse an arbitrary path', async () => {
    for (const path of [join('.dsh', 'state', 'superagent', 'notes.log'), join('.dsh', 'orchestrator.sqlite-wal'), join('.acryl', 'state', 'orchestrator.sqlite-wal')]) {
      const osHome = home()
      await olderHolder(join(osHome, path))
      const { status, output } = run(osHome, pause)
      expect(output, path).not.toContain('excused')
      expect(status, path).toBe(1)
    }
  }, 30_000)

  it('never excuses a change in the Registry, whoever holds it', async () => {
    const osHome = home()
    const entry = join(osHome, '.acryl-instances', '.running', 'held.json')
    await olderHolder(entry)
    const { status, output } = run(osHome, pause)
    expect(output).toContain('held.json')
    expect(status).toBe(1)
  }, 20_000)
})
