import { spawnSync } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withoutInheritedDescriptors } from '../src/runner.ts'

describe('what a started app inherits from the Electron main process', () => {
  it('only Linux with bash gets the wrapper; every other case starts the command as it is', () => {
    expect(withoutInheritedDescriptors('npm', ['run', 'dev'], 'darwin', true)).toEqual({ program: 'npm', args: ['run', 'dev'] })
    expect(withoutInheritedDescriptors('npm', ['run', 'dev'], 'win32', true)).toEqual({ program: 'npm', args: ['run', 'dev'] })
    expect(withoutInheritedDescriptors('npm', ['run', 'dev'], 'linux', false)).toEqual({ program: 'npm', args: ['run', 'dev'] })
    const wrapped = withoutInheritedDescriptors('npm', ['run', 'dev'], 'linux', true)
    expect(wrapped.program).toBe('/bin/bash')
    expect(wrapped.args.slice(-3)).toEqual(['npm', 'run', 'dev'])
  })

  // A descriptor handed down at index 3 stands for what Chromium leaves open (its DevTools port): the command must not see it.
  it.skipIf(process.platform !== 'linux')('on Linux a descriptor above 2 does not reach the command, and its arguments arrive intact', () => {
    const fd = openSync('/dev/null', 'r')
    try {
      const probe = 'if [ -e /proc/$$/fd/3 ]; then echo "fd3 open [$1]"; else echo "fd3 closed [$1]"; fi'
      const plain = spawnSync('/bin/sh', ['-c', probe, 'x', 'a b'], { stdio: ['ignore', 'pipe', 'pipe', fd], encoding: 'utf8' })
      expect(plain.stdout).toContain('fd3 open')
      const { program, args } = withoutInheritedDescriptors('/bin/sh', ['-c', probe, 'x', 'a b'])
      const clean = spawnSync(program, [...args], { stdio: ['ignore', 'pipe', 'pipe', fd], encoding: 'utf8' })
      expect(clean.status).toBe(0)
      expect(clean.stdout.trim()).toBe('fd3 closed [a b]')
    } finally {
      closeSync(fd)
    }
  })
})
