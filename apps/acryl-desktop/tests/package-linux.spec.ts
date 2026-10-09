import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { linuxOutputDirectory, packageLinuxDeb, type LinuxPackageOptions } from '../scripts/package-linux.ts'

interface CommandCall {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}

function options(calls: CommandCall[], over: Partial<LinuxPackageOptions> = {}, logs: string[] = []): LinuxPackageOptions {
  return {
    env: { PATH: '/usr/bin', SAFE_VALUE: 'kept' },
    platform: 'linux',
    arch: 'x64',
    nodeVersion: '24.19.0',
    workspaceRoot: '/repo',
    desktopRoot: '/repo/apps/acryl-desktop',
    builderCli: '/repo/node_modules/electron-builder/cli.js',
    nodeExecutable: '/usr/bin/node',
    run: (command, args, cwd, env) => { calls.push({ command, args: [...args], cwd, env: { ...env } }) },
    listFiles: () => ['acryl-desktop-linux-x64.deb', 'builder-debug.yml'],
    log: message => logs.push(message),
    ...over,
  }
}

describe('Linux .deb packaging', () => {
  it('builds and checks the Desktop, then runs electron-builder for the host architecture, unsigned, into its own folder', () => {
    const calls: CommandCall[] = []
    const logs: string[] = []
    const written = packageLinuxDeb(options(calls, {}, logs))

    expect(calls.map(call => [call.command, ...call.args].join(' '))).toEqual([
      'corepack pnpm --filter acryl-desktop run build',
      'corepack pnpm --filter acryl-desktop run verify:closure',
      `/usr/bin/node /repo/node_modules/electron-builder/cli.js --linux deb --x64 --publish never --config.npmRebuild=false --config.directories.output=${join('dist', 'linux-x64')}`,
    ])
    expect(calls[0]?.cwd).toBe('/repo')
    expect(calls[2]?.cwd).toBe('/repo/apps/acryl-desktop')
    expect(calls[2]?.env).toMatchObject({ SAFE_VALUE: 'kept', CSC_IDENTITY_AUTO_DISCOVERY: 'false' })
    expect(written).toBe(join('/repo/apps/acryl-desktop', 'dist', 'linux-x64', 'acryl-desktop-linux-x64.deb'))
    expect(logs.at(-1)).toContain(written)
  })

  it('uses the arm64 target and folder on an arm64 host', () => {
    const calls: CommandCall[] = []
    packageLinuxDeb(options(calls, { arch: 'arm64' }))
    expect(calls[2]?.args).toContain('--arm64')
    expect(calls[2]?.args).toContain(`--config.directories.output=${linuxOutputDirectory('arm64')}`)
  })

  it('refuses a host that is not native Linux, an unsupported architecture, and an old Node, before running anything', () => {
    for (const bad of [{ platform: 'darwin' as const }, { arch: 'ia32' }, { nodeVersion: '20.11.0' }, { nodeVersion: '22.18.0' }]) {
      const calls: CommandCall[] = []
      expect(() => packageLinuxDeb(options(calls, bad))).toThrow()
      expect(calls).toEqual([])
    }
  })

  it('fails loudly when electron-builder wrote no .deb', () => {
    expect(() => packageLinuxDeb(options([], { listFiles: () => ['builder-debug.yml'] }))).toThrow(/no \.deb/u)
  })
})
