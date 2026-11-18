import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli'
import {
  APP_PORTS,
  type Check,
  formatChecks,
  machineProbes,
  type Probes,
  preflight,
  type Run,
  runPreflight,
} from '../src/preflight'

const LONG_PATHS_ON =
  '\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\FileSystem\r\n    LongPathsEnabled    REG_DWORD    0x1\r\n'

/** A machine with everything in place; each test takes one thing away. */
function machine(overrides: Partial<Probes> = {}, programs: Record<string, Run> = {}): Probes {
  const runs: Record<string, Run> = {
    npm: { code: 0, stdout: '11.6.2\n' },
    git: { code: 0, stdout: 'git version 2.51.0\n' },
    gh: { code: 0, stdout: '' },
    'powershell.exe': { code: 0, stdout: '5.1.19041.6456\r\n' },
    reg: { code: 0, stdout: LONG_PATHS_ON },
    ...programs,
  }
  const onPath = new Set(['claude', 'gh'])
  return {
    platform: 'darwin',
    nodeVersion: '24.11.0',
    env: {},
    home: '/home/attendee',
    // On Windows npm starts as `node npm-cli.js` or `cmd.exe /c npm.cmd` (spawn.ts): either way it is npm.
    run: async (file, args) =>
      runs[
        file === 'npm' || args.some((arg) => /npm-cli\.c?js$|^npm\.cmd$/.test(arg)) ? 'npm' : file
      ] ?? {
        code: null,
        stdout: '',
      },
    onPath: (program) => onPath.has(program),
    readFile: () => undefined,
    freePort: async (from) => from,
    ...overrides,
  }
}

const byName = (checks: readonly Check[], name: string) => {
  const check = checks.find((each) => each.name === name)
  if (!check) throw new Error(`no ${name} check`)
  return check
}

describe('acrylblends preflight', () => {
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    it(`passes a ready ${platform} machine with one line per check and exit 0`, async () => {
      let out = ''
      const code = await runPreflight(
        { stdout: { write: (text: string) => (out += text) } },
        machine({ platform, env: platform === 'win32' ? { ComSpec: 'C:\\Windows\\cmd.exe' } : {} }),
      )
      expect(code).toBe(0)
      const lines = out.trimEnd().split('\n')
      const names = ['node', 'npm', 'git', 'agent', 'port', 'gh']
      if (platform === 'win32') names.push('powershell', 'long paths')
      expect(lines).toHaveLength(names.length + 1)
      for (const [index, name] of names.entries())
        expect(lines[index]).toMatch(new RegExp(`^PASS  ${name}\\s`))
      expect(lines.at(-1)).toBe('Ready for the workshop.')
    })
  }

  it('asks for Node 22.19 or newer, and accepts 22.19 itself', async () => {
    expect(byName(await preflight(machine({ nodeVersion: '22.18.0' })), 'node')).toMatchObject({
      status: 'FIX',
      detail: expect.stringContaining('install Node 22.19 or newer'),
    })
    expect(byName(await preflight(machine({ nodeVersion: '22.19.0' })), 'node').status).toBe('PASS')
    expect(byName(await preflight(machine({ nodeVersion: '26.0.0' })), 'node').status).toBe('PASS')
  })

  it('names the fix for a missing npm or git', async () => {
    const checks = await preflight(
      machine({}, { npm: { code: null, stdout: '' }, git: { code: null, stdout: '' } }),
    )
    expect(byName(checks, 'npm')).toMatchObject({
      status: 'FIX',
      detail: expect.stringContaining('reinstall Node'),
    })
    expect(byName(checks, 'git')).toMatchObject({
      status: 'FIX',
      detail: expect.stringContaining('https://git-scm.com'),
    })
  })

  it('reports the versions it found', async () => {
    const checks = await preflight(machine())
    expect(byName(checks, 'npm').detail).toBe('11.6.2')
    expect(byName(checks, 'git').detail).toBe('2.51.0')
  })

  it('asks for a coding agent when none is on the PATH, naming each install', async () => {
    const check = byName(
      await preflight(machine({ onPath: (program) => program === 'gh' })),
      'agent',
    )
    expect(check.status).toBe('FIX')
    for (const install of [
      '@openai/codex',
      'Claude Code',
      '@earendil-works/pi-coding-agent',
      'DEEPSEEK_API_KEY',
    ])
      expect(check.detail).toContain(install)
  })

  it('counts pi only with a DeepSeek key, from the environment or its own auth.json', async () => {
    const piOnly = { onPath: (program: string) => program === 'pi' }
    expect(byName(await preflight(machine(piOnly)), 'agent')).toMatchObject({
      status: 'FIX',
      detail: expect.stringContaining('pi has no DeepSeek key'),
    })
    expect(
      byName(await preflight(machine({ ...piOnly, env: { DEEPSEEK_API_KEY: 'set' } })), 'agent'),
    ).toMatchObject({ status: 'PASS', detail: expect.stringMatching(/^pi /) })
    const stored = machine({
      ...piOnly,
      readFile: (path) =>
        path.replaceAll('\\', '/') === '/home/attendee/.pi/agent/auth.json'
          ? '{"deepseek":{"key":"stored"}}'
          : undefined,
    })
    expect(byName(await preflight(stored), 'agent').status).toBe('PASS')
  })

  it('lists every usable agent', async () => {
    const check = byName(
      await preflight(machine({ onPath: (program) => ['claude', 'codex'].includes(program) })),
      'agent',
    )
    expect(check.detail).toBe(
      'claude (be logged in: run claude once), codex (be logged in: codex login)',
    )
  })

  it('says what each agent needs, and does not ask for a login pi does not use', async () => {
    const check = byName(
      await preflight(
        machine({
          onPath: (program) => program === 'pi',
          env: { DEEPSEEK_API_KEY: 'sk-test-key' },
        }),
      ),
      'agent',
    )
    expect(check.status).toBe('PASS')
    expect(check.detail).toBe('pi (DeepSeek key found)')
  })

  it('names the free port, and the cause when loopback refuses every one', async () => {
    expect(byName(await preflight(machine({ freePort: async () => 3107 })), 'port').detail).toMatch(
      /^127\.0\.0\.1:3107 is free/,
    )
    expect(
      byName(await preflight(machine({ freePort: async () => 'EACCES' })), 'port'),
    ).toMatchObject({
      status: 'FIX',
      detail: expect.stringContaining('(EACCES): allow Node in the firewall'),
    })
  })

  it('keeps gh a NOTE: only block 5 needs it', async () => {
    const missing = await preflight(machine({ onPath: (program) => program === 'claude' }))
    expect(byName(missing, 'gh')).toMatchObject({
      status: 'NOTE',
      detail: expect.stringContaining('https://cli.github.com'),
    })
    const loggedOut = await preflight(machine({}, { gh: { code: 1, stdout: '' } }))
    expect(byName(loggedOut, 'gh')).toMatchObject({
      status: 'NOTE',
      detail: expect.stringContaining('gh auth login'),
    })
    let out = ''
    const code = await runPreflight(
      { stdout: { write: (text: string) => (out += text) } },
      machine({ onPath: (p) => p === 'claude' }),
    )
    expect(code).toBe(0)
    expect(out).toContain('NOTE  gh')
  })

  it('checks PowerShell and long paths on Windows only', async () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const names = (await preflight(machine({ platform }))).map((check) => check.name)
      expect(names).not.toContain('powershell')
      expect(names).not.toContain('long paths')
    }
    const windows = await preflight(machine({ platform: 'win32' }))
    expect(byName(windows, 'powershell').detail).toMatch(
      /^Windows PowerShell 5\.1\.19041\.6456: use the guide's PowerShell lines/,
    )
    expect(byName(windows, 'long paths')).toEqual({
      name: 'long paths',
      status: 'PASS',
      detail: 'enabled',
    })
  })

  it('notes Git Bash path rewriting on Windows only, when the shell is Git Bash', async () => {
    const env = { MSYSTEM: 'MINGW64' }
    expect(byName(await preflight(machine({ platform: 'win32', env })), 'git bash')).toMatchObject({
      status: 'NOTE',
      detail: expect.stringContaining('the door handles it from acrylblends 1.0.7'),
    })
    expect(
      (await preflight(machine({ platform: 'win32' }))).map((check) => check.name),
    ).not.toContain('git bash')
    expect(
      (await preflight(machine({ platform: 'linux', env }))).map((check) => check.name),
    ).not.toContain('git bash')
  })

  it('names pwsh 7 when it is there', async () => {
    const check = byName(
      await preflight(
        machine({
          platform: 'win32',
          onPath: (program) => ['claude', 'gh', 'pwsh'].includes(program),
        }),
      ),
      'powershell',
    )
    expect(check).toMatchObject({
      status: 'PASS',
      detail: 'pwsh 7 found, Windows PowerShell 5.1.19041.6456',
    })
  })

  it('notes the administrator command when long paths are off or unreadable, without failing', async () => {
    for (const reg of [
      { code: 0, stdout: LONG_PATHS_ON.replace('0x1', '0x0') },
      { code: 1, stdout: '' },
    ]) {
      const check = byName(await preflight(machine({ platform: 'win32' }, { reg })), 'long paths')
      expect(check.status).toBe('NOTE')
      expect(check.detail).toMatch(/^off; if an install fails with ENAMETOOLONG/)
      expect(check.detail).toContain('LongPathsEnabled -Value 1 -PropertyType DWORD -Force')
    }
  })

  it('exits 1 and counts the fixes while any check needs one', async () => {
    let out = ''
    const code = await runPreflight(
      { stdout: { write: (text: string) => (out += text) } },
      machine({ nodeVersion: '20.0.0' }, { git: { code: null, stdout: '' } }),
    )
    expect(code).toBe(1)
    expect(out.trimEnd().split('\n').at(-1)).toBe(
      '2 to fix before the workshop: run each FIX line, then npx acrylblends@latest preflight again.',
    )
  })

  it('aligns the names so the column of details lines up', () => {
    const text = formatChecks([
      { name: 'node', status: 'PASS', detail: 'a' },
      { name: 'long paths', status: 'FIX', detail: 'b' },
    ])
    expect(text).toBe(
      'PASS  node        a\nFIX   long paths  b\n1 to fix before the workshop: run each FIX line, then npx acrylblends@latest preflight again.\n',
    )
  })

  it('is a command of the CLI and in its help', async () => {
    let help = ''
    await runCli(['--help'], {
      stdout: { write: (text: string) => (help += text) },
      stderr: { write: () => true },
      cwd: '.',
      ask: undefined,
      install: async () => 0,
    })
    expect(help).toContain('acrylblends preflight')
  })

  it('finds a free port on this machine, and skips one that is taken', async () => {
    const probes = machineProbes()
    const first = await probes.freePort(APP_PORTS[0], APP_PORTS[1])
    expect(typeof first).toBe('number')
    const held = createServer()
    await new Promise<void>((done) =>
      held.listen({ port: first as number, host: '127.0.0.1' }, done),
    )
    try {
      const next = await probes.freePort(first as number, APP_PORTS[1])
      expect(next).not.toBe(first)
      expect(typeof next).toBe('number')
    } finally {
      await new Promise((done) => held.close(done))
    }
  })
})
