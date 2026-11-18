import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Io } from './io'
import { packageManagerInvocation } from './spawn'

/**
 * `acrylblends preflight`: what a workshop machine needs, checked before the first command, with one line per check. PASS names what was
 * found; FIX is the exact command or address that fixes it; NOTE is something the first blocks do without. Exit 1 while anything needs a fix.
 * Every probe of the machine goes through `Probes`, so each check's text is tested for every platform on any platform.
 */

export type Status = 'PASS' | 'FIX' | 'NOTE'

export interface Check {
  name: string
  status: Status
  detail: string
}

/** A program's run: `code` is null when it could not be started (not installed). */
export interface Run {
  code: number | null
  stdout: string
}

export interface Probes {
  platform: NodeJS.Platform
  nodeVersion: string
  env: NodeJS.ProcessEnv
  home: string
  run(file: string, args: readonly string[]): Promise<Run>
  onPath(program: string): boolean
  readFile(path: string): string | undefined
  /** The first port in [from, to] that 127.0.0.1 can listen on, or the error code that stopped every one. */
  freePort(from: number, to: number): Promise<number | string>
}

/** The Node the framework needs (the bin refuses an older one before loading anything). */
export const NODE_MINIMUM = [22, 19] as const
/** The range an app's port is chosen in (plugins/instance: PORT_BASE and PORT_SPAN). */
export const APP_PORTS = [3100, 3999] as const

const AGENTS = ['claude', 'codex', 'pi'] as const
const AGENT_INSTALL =
  'install one coding agent: npm i -g @openai/codex then codex login, or Claude Code (https://claude.com/claude-code), or npm i -g @earendil-works/pi-coding-agent with DEEPSEEK_API_KEY set'
/** Off by default on Windows; a full workshop ran without it, so it is a NOTE: what to do if a path is ever too long. */
const LONG_PATHS_NOTE =
  'off; if an install fails with ENAMETOOLONG or "path too long", in PowerShell as administrator: New-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force'

const firstLine = (text: string) => text.trim().split(/\r?\n/)[0]?.trim() ?? ''

export function checkNode(version: string): Check {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  const [needMajor, needMinor] = NODE_MINIMUM
  const ok = major > needMajor || (major === needMajor && minor >= needMinor)
  return ok
    ? { name: 'node', status: 'PASS', detail: version }
    : {
        name: 'node',
        status: 'FIX',
        detail: `${version} is too old: install Node ${needMajor}.${needMinor} or newer (the LTS) from https://nodejs.org`,
      }
}

export async function checkNpm(probes: Probes): Promise<Check> {
  const npm = packageManagerInvocation('npm', ['--version'], probes.platform, probes.env)
  const result = await probes.run(npm.file, npm.args)
  return result.code === 0
    ? { name: 'npm', status: 'PASS', detail: firstLine(result.stdout) }
    : {
        name: 'npm',
        status: 'FIX',
        detail: 'npm did not run: it comes with Node, reinstall Node from https://nodejs.org',
      }
}

export async function checkGit(probes: Probes): Promise<Check> {
  const result = await probes.run('git', ['--version'])
  return result.code === 0
    ? { name: 'git', status: 'PASS', detail: firstLine(result.stdout).replace(/^git version /, '') }
    : { name: 'git', status: 'FIX', detail: 'install git from https://git-scm.com' }
}

/** Whether pi can reach DeepSeek: the key in the environment, or the one pi stored when its owner logged in (the panel's rule). */
export function piHasKey(probes: Pick<Probes, 'env' | 'home' | 'readFile'>): boolean {
  if (probes.env.DEEPSEEK_API_KEY) return true
  const stored = probes.readFile(
    join(probes.env.PI_CODING_AGENT_DIR ?? join(probes.home, '.pi', 'agent'), 'auth.json'),
  )
  if (stored === undefined) return false
  try {
    const key = (JSON.parse(stored) as Record<string, { key?: unknown } | undefined>).deepseek?.key
    return typeof key === 'string' && key !== ''
  } catch {
    return false
  }
}

/**
 * The coding agents the agent panel would offer: on the PATH, and pi only with a DeepSeek key. On Windows the panel also reads an npm shim to find
 * its script (plugins/agent-panel/launch.ts); that is plugin code an app carries, not something the command imports, so the PATH is checked here.
 */
const HINT: Record<(typeof AGENTS)[number], string> = {
  claude: 'be logged in: run claude once',
  codex: 'be logged in: codex login',
  pi: 'DeepSeek key found',
}

export function checkAgent(probes: Probes): Check {
  const installed = AGENTS.filter((agent) => probes.onPath(agent))
  const usable = installed.filter((agent) => agent !== 'pi' || piHasKey(probes))
  if (usable.length > 0)
    return {
      name: 'agent',
      status: 'PASS',
      // Each agent says what it needs, so a line never asks for a login pi does not use: claude and codex use their own login, pi uses the DeepSeek key.
      detail: usable.map((agent) => `${agent} (${HINT[agent]})`).join(', '),
    }
  if (installed.includes('pi'))
    return {
      name: 'agent',
      status: 'FIX',
      detail:
        'pi has no DeepSeek key: set DEEPSEEK_API_KEY, or log in to pi once, or install another agent',
    }
  return { name: 'agent', status: 'FIX', detail: AGENT_INSTALL }
}

export async function checkPort(probes: Probes): Promise<Check> {
  const [from, to] = APP_PORTS
  const found = await probes.freePort(from, to)
  return typeof found === 'number'
    ? {
        name: 'port',
        status: 'PASS',
        detail: `127.0.0.1:${found} is free (apps use ${from}-${to})`,
      }
    : {
        name: 'port',
        status: 'FIX',
        detail: `nothing can listen on 127.0.0.1 in ${from}-${to} (${found}): allow Node in the firewall or security software, or free a port`,
      }
}

/** Only block 5 needs gh, so it is a NOTE, never a FIX. */
export async function checkGh(probes: Probes): Promise<Check> {
  if (!probes.onPath('gh'))
    return {
      name: 'gh',
      status: 'NOTE',
      detail:
        'not installed; block 5 publishes with it: https://cli.github.com, then gh auth login',
    }
  const status = await probes.run('gh', ['auth', 'status'])
  return status.code === 0
    ? { name: 'gh', status: 'PASS', detail: 'logged in' }
    : { name: 'gh', status: 'NOTE', detail: 'not logged in; block 5 needs it: gh auth login' }
}

export async function checkPowerShell(probes: Probes): Promise<Check> {
  const pwsh = probes.onPath('pwsh')
  const result = await probes.run('powershell.exe', [
    '-NoProfile',
    '-Command',
    '$PSVersionTable.PSVersion.ToString()',
  ])
  const version = result.code === 0 ? firstLine(result.stdout) : undefined
  if (pwsh)
    return {
      name: 'powershell',
      status: 'PASS',
      detail: `pwsh 7 found${version ? `, Windows PowerShell ${version}` : ''}`,
    }
  if (version !== undefined)
    return {
      name: 'powershell',
      status: 'PASS',
      detail: `Windows PowerShell ${version}: use the guide's PowerShell lines where they differ (&& and NODE_ENV=... need PowerShell 7)`,
    }
  return {
    name: 'powershell',
    status: 'NOTE',
    detail:
      'powershell.exe did not run; use cmd.exe lines or install PowerShell 7 (winget install Microsoft.PowerShell)',
  }
}

export async function checkLongPaths(probes: Probes): Promise<Check> {
  const result = await probes.run('reg', [
    'query',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    '/v',
    'LongPathsEnabled',
  ])
  const value = /LongPathsEnabled\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(result.stdout)?.[1]
  return value !== undefined && Number.parseInt(value, 16) === 1
    ? { name: 'long paths', status: 'PASS', detail: 'enabled' }
    : { name: 'long paths', status: 'NOTE', detail: LONG_PATHS_NOTE }
}

/** Git Bash rewrites a slash-led argument into a Windows path (`/board` becomes `C:/Program Files/Git/board`); the door undoes it from 1.0.7. */
export function checkGitBash(probes: Pick<Probes, 'env'>): Check | undefined {
  if (!probes.env.MSYSTEM) return undefined
  return {
    name: 'git bash',
    status: 'NOTE',
    detail:
      'this shell rewrites /paths: the door handles it from acrylblends 1.0.7; on an older app run .acryl/bin/acryl from PowerShell, or npx acrylblends@latest upgrade',
  }
}

export async function preflight(probes: Probes): Promise<Check[]> {
  const checks = [
    checkNode(probes.nodeVersion),
    await checkNpm(probes),
    await checkGit(probes),
    checkAgent(probes),
    await checkPort(probes),
    await checkGh(probes),
  ]
  if (probes.platform === 'win32') {
    checks.push(await checkPowerShell(probes), await checkLongPaths(probes))
    const gitBash = checkGitBash(probes)
    if (gitBash) checks.push(gitBash)
  }
  return checks
}

export function formatChecks(checks: readonly Check[]): string {
  const width = Math.max(...checks.map((check) => check.name.length))
  const lines = checks.map(
    (check) => `${check.status.padEnd(4)}  ${check.name.padEnd(width)}  ${check.detail}`,
  )
  const fixes = checks.filter((check) => check.status === 'FIX').length
  lines.push(
    fixes === 0
      ? 'Ready for the workshop.'
      : `${fixes} to fix before the workshop: run each FIX line, then npx acrylblends@latest preflight again.`,
  )
  return `${lines.join('\n')}\n`
}

/** The real machine. A program that cannot start resolves with code null; nothing here throws. */
export function machineProbes(): Probes {
  return {
    platform: process.platform,
    nodeVersion: process.versions.node,
    env: process.env,
    home: homedir(),
    run: (file, args) =>
      new Promise((done) => {
        let stdout = ''
        const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
        const timer = setTimeout(() => child.kill(), 15_000)
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString()
        })
        child.on('error', () => {
          clearTimeout(timer)
          done({ code: null, stdout })
        })
        child.on('close', (code) => {
          clearTimeout(timer)
          done({ code, stdout })
        })
      }),
    onPath: (program) =>
      spawnSync(process.platform === 'win32' ? 'where' : 'which', [program], { windowsHide: true })
        .status === 0,
    readFile: (path) => {
      try {
        return readFileSync(path, 'utf8')
      } catch {
        return undefined
      }
    },
    freePort: async (from, to) => {
      let last = 'no port tried'
      for (let port = from; port <= to; port++) {
        const result = await new Promise<true | string>((done) => {
          const server = createServer()
          server.once('error', (error: NodeJS.ErrnoException) => done(error.code ?? error.message))
          server.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
            server.close(() => done(true)),
          )
        })
        if (result === true) return port
        last = result
        // A refusal that is not "in use" (EACCES from a firewall or policy) holds for every port: stop at once.
        if (last !== 'EADDRINUSE') return last
      }
      return last
    },
  }
}

export async function runPreflight(
  io: Pick<Io, 'stdout'>,
  probes: Probes = machineProbes(),
): Promise<number> {
  const checks = await preflight(probes)
  io.stdout.write(formatChecks(checks))
  return checks.some((check) => check.status === 'FIX') ? 1 : 0
}
