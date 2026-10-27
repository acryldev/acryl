/**
 * The terminal's search path comes from the user's login shell, which an interactive zsh answers in about a second. The lookup must
 * never stall the Host: it runs asynchronously, once per shell, home and PATH, and what needs it (`start`, `canRun`) waits for it.
 * A fake login shell here sleeps, counts its runs and prints a folder only it knows, so each of those is observable.
 */

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspacePtyRegistry, workspacePtySpawnDirs, type WorkspacePtyProcess } from '../../src/pty/service.ts'

const folders: string[] = []
afterEach(() => {
  while (folders.length > 0) rmSync(folders.pop() ?? '', { recursive: true, force: true })
})

function fakeProcess(): WorkspacePtyProcess {
  return { onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }), write() {}, resize() {}, kill() {} }
}

/** A login shell that takes `delay` seconds, appends a line to `runs` each time, and prints a PATH whose first folder holds `tool`. */
function loginShell(options: { delay: number, exitCode?: number }) {
  const root = mkdtempSync(join(tmpdir(), 'acryl-login-shell-'))
  folders.push(root)
  const bin = join(root, 'login-bin')
  mkdirSync(bin)
  const tool = join(bin, 'only-on-login-path')
  writeFileSync(tool, '#!/bin/sh\n')
  chmodSync(tool, 0o755)
  const runs = join(root, 'runs')
  writeFileSync(runs, '')
  const shell = join(root, 'shell')
  writeFileSync(shell, `#!/bin/sh\necho run >> '${runs}'\nsleep ${String(options.delay)}\necho '${bin}:/usr/bin'\nexit ${String(options.exitCode ?? 0)}\n`)
  chmodSync(shell, 0o755)
  return {
    // A home of its own keeps every test's lookup out of the others' cache entry.
    env: { SHELL: shell, HOME: root, PATH: '/usr/bin:/bin' },
    bin,
    runs: () => readFileSync(runs, 'utf8').split('\n').filter(line => line === 'run').length,
  }
}

describe.skipIf(process.platform === 'win32')('the terminal search path', () => {
  it('is asked of the login shell without blocking: the registry is built at once and timers keep firing while the shell answers', async () => {
    const shell = loginShell({ delay: 0.4 })
    const built = performance.now()
    const registry = new WorkspacePtyRegistry({ spawn: fakeProcess, env: shell.env, platform: 'darwin' })
    expect(performance.now() - built).toBeLessThan(100)
    let ticks = 0
    const timer = setInterval(() => { ticks += 1 }, 20)
    try {
      expect(await registry.canRun('only-on-login-path')).toBe(true)
    } finally {
      clearInterval(timer)
    }
    // The shell took about 400 ms; an event loop blocked for it would have run the 20 ms timer once at most.
    expect(ticks).toBeGreaterThan(5)
  })

  it('makes a start wait for it, so a program only the login shell knows is found', async () => {
    const shell = loginShell({ delay: 0.2 })
    const spawned: string[] = []
    const registry = new WorkspacePtyRegistry({
      spawn: (file) => { spawned.push(file); return fakeProcess() },
      agents: { resolve: id => (id === 'tool' ? { command: 'only-on-login-path', args: [] } : undefined) },
      env: shell.env,
      platform: 'darwin',
    })
    await registry.start('tool')
    expect(spawned).toEqual([join(shell.bin, 'only-on-login-path')])
  })

  it('asks the shell once for the same shell, home and PATH, however many registries (plugin reloads) there are', async () => {
    const shell = loginShell({ delay: 0.1 })
    const first = workspacePtySpawnDirs(shell.env, 'darwin')
    const registries = Array.from({ length: 3 }, () => new WorkspacePtyRegistry({ spawn: fakeProcess, env: shell.env, platform: 'darwin' }))
    expect(workspacePtySpawnDirs(shell.env, 'darwin')).toBe(first)
    for (const registry of registries) expect(await registry.canRun('only-on-login-path')).toBe(true)
    expect(shell.runs()).toBe(1)
    expect(await first).toEqual(['/usr/bin', '/bin', shell.bin])
  })

  it('keeps the environment PATH when the login shell fails', async () => {
    const shell = loginShell({ delay: 0, exitCode: 3 })
    expect(await workspacePtySpawnDirs(shell.env, 'darwin')).toEqual(['/usr/bin', '/bin'])
    // Both forms were tried: the interactive login shell, then the plain login shell.
    expect(shell.runs()).toBe(2)
  })

  it('spawns nothing for a start still waiting when the registry is disposed (the plugin unloaded)', async () => {
    const shell = loginShell({ delay: 0.3 })
    const spawned: string[] = []
    const registry = new WorkspacePtyRegistry({ spawn: (file) => { spawned.push(file); return fakeProcess() }, env: shell.env, platform: 'darwin' })
    const starting = registry.start('shell')
    await registry.disposeAll()
    await expect(starting).rejects.toThrow('disposed')
    expect(spawned).toEqual([])
  })
})
