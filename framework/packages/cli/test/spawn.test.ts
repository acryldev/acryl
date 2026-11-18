import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { packageManagerInvocation } from '../src/spawn'

const win = (command: string, env: NodeJS.ProcessEnv = {}, exists = true) =>
  packageManagerInvocation(
    'npm' === command ? 'npm' : command,
    ['install'],
    'win32',
    env,
    () => exists,
    'C:\\node\\node.exe',
  )

describe('the install step starts the package manager without a shell', () => {
  it('runs the command as it is off Windows', () => {
    expect(packageManagerInvocation('pnpm', ['install'], 'linux')).toEqual({
      file: 'pnpm',
      args: ['install'],
    })
  })

  it('runs npm through node and npm-cli.js on Windows', () => {
    expect(win('npm', { npm_execpath: 'C:\\npm\\bin\\npm-cli.js' })).toEqual({
      file: 'C:\\node\\node.exe',
      args: ['C:\\npm\\bin\\npm-cli.js', 'install'],
    })
    expect(win('npm').file).toBe('C:\\node\\node.exe')
  })

  it('runs another manager through cmd.exe with an argument array on Windows', () => {
    expect(win('pnpm', { ComSpec: 'C:\\Windows\\cmd.exe' })).toEqual({
      file: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm.cmd', 'install'],
    })
  })

  it('never sets the shell option in the spawn call', () => {
    for (const file of ['../src/io.ts', '../src/spawn.ts'])
      expect(readFileSync(new URL(file, import.meta.url), 'utf8')).not.toMatch(/shell\s*:/)
  })
})
