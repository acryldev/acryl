import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { WorkspacePtyRegistry, type WorkspacePtyProcess, type WorkspacePtySpawn } from '../../src/pty/service.ts'

function fakeProcess(): WorkspacePtyProcess {
  return {
    onData: () => ({ dispose() {} }),
    onExit: () => ({ dispose() {} }),
    write() {},
    resize() {},
    kill() {},
  } as unknown as WorkspacePtyProcess
}

function registry(defaultCwd: string): { registry: WorkspacePtyRegistry; cwds: string[] } {
  const cwds: string[] = []
  const spawn: WorkspacePtySpawn = (_file, _args, options) => {
    cwds.push(options.cwd)
    return fakeProcess()
  }
  return {
    cwds,
    registry: new WorkspacePtyRegistry({
      spawn,
      cwd: defaultCwd,
      platform: 'darwin',
      // A shell that exists on every developer machine, so command resolution never depends on PATH.
      env: { SHELL: '/bin/sh', PATH: '/usr/bin:/bin' },
      createId: () => 'pty_test',
    }),
  }
}

describe('WorkspacePtyRegistry cwd', () => {
  const home = mkdtempSync(join(tmpdir(), 'acryl-pty-'))
  const worktree = mkdtempSync(join(tmpdir(), 'acryl-pty-wt-'))
  afterAll(() => { for (const dir of [home, worktree]) rmSync(dir, { recursive: true, force: true }) })

  it('starts in the registry default directory when none is given', async () => {
    const { registry: r, cwds } = registry(home)
    await r.start('shell')
    expect(cwds).toEqual([home])
  })

  it('starts in the requested worktree directory', async () => {
    const { registry: r, cwds } = registry(home)
    await r.start('shell', worktree)
    expect(cwds).toEqual([worktree])
  })

  it.each([
    ['relative', 'some/dir'],
    ['empty', ''],
    ['missing', join(tmpdir(), 'acryl-pty-does-not-exist')],
    ['NUL', `${worktree}\0x`],
  ])('rejects a %s cwd without spawning', async (_name, cwd) => {
    const { registry: r, cwds } = registry(home)
    await expect(r.start('shell', cwd)).rejects.toThrow(/cwd must be an existing absolute directory/)
    expect(cwds).toEqual([])
  })

  it('rejects a file used as cwd', async () => {
    const file = join(worktree, 'a.txt')
    writeFileSync(file, 'x')
    const { registry: r } = registry(home)
    await expect(r.start('shell', file)).rejects.toThrow(/cwd must be an existing absolute directory/)
  })
})
