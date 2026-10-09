import { describe, expect, it } from 'vitest'

// @ts-expect-error launch-dev.mjs is a standalone script without type declarations
import { linuxDevSandboxArgs } from '../scripts/launch-dev.mjs'

type Args = (executable: string, options: {
  platform: NodeJS.Platform
  stat: (path: string) => { uid: number, mode: number }
  argv?: string[]
}) => string[]
const sandboxArgs = linuxDevSandboxArgs as Args

const configured = () => ({ uid: 0, mode: 0o104755 })
const unconfigured = () => ({ uid: 1000, mode: 0o100755 })

describe('linuxDevSandboxArgs', () => {
  it('keeps the sandbox when the SUID helper is root-owned and setuid', () => {
    expect(sandboxArgs('/e/electron', { platform: 'linux', stat: configured })).toEqual([])
  })

  it('starts the development run without the sandbox when the helper is not configured', () => {
    expect(sandboxArgs('/e/electron', { platform: 'linux', stat: unconfigured })).toEqual(['--no-sandbox'])
  })

  it('does nothing off Linux, when the caller already chose, or when the helper is absent', () => {
    expect(sandboxArgs('/e/electron', { platform: 'darwin', stat: unconfigured })).toEqual([])
    expect(sandboxArgs('/e/electron', { platform: 'linux', stat: unconfigured, argv: ['--no-sandbox'] })).toEqual([])
    expect(sandboxArgs('/e/electron', { platform: 'linux', stat: () => { throw new Error('ENOENT') } })).toEqual([])
  })
})
