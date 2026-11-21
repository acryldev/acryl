import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { test } from 'node:test'
import { withoutInheritedDescriptors } from '../inherited.ts'

test('only Linux with bash gets the wrapper; every other case starts the command as it is', () => {
  assert.deepEqual(withoutInheritedDescriptors('npm', ['run', 'dev'], 'darwin', true), {
    program: 'npm',
    args: ['run', 'dev'],
  })
  assert.deepEqual(withoutInheritedDescriptors('npm', ['run', 'dev'], 'win32', true), {
    program: 'npm',
    args: ['run', 'dev'],
  })
  assert.deepEqual(withoutInheritedDescriptors('npm', ['run', 'dev'], 'linux', false), {
    program: 'npm',
    args: ['run', 'dev'],
  })
  const wrapped = withoutInheritedDescriptors('npm', ['run', 'dev'], 'linux', true)
  assert.equal(wrapped.program, '/bin/bash')
  assert.deepEqual(wrapped.args.slice(-3), ['npm', 'run', 'dev'])
})

// A descriptor handed down at index 3 stands for what Chromium leaves open: the child must not see it, and its own standard streams must be untouched.
test('on Linux a descriptor above 2 does not reach the command, and its arguments arrive intact', {
  skip: process.platform !== 'linux',
}, () => {
  const fd = openSync('/dev/null', 'r')
  try {
    // `ls` would open a descriptor of its own, so the shell looks at its own fd 3 directly.
    const probe =
      'if [ -e /proc/$$/fd/3 ]; then echo "fd3 open [$1]"; else echo "fd3 closed [$1]"; fi'
    const plain = spawnSync('/bin/sh', ['-c', probe, 'x', 'a b'], {
      stdio: ['ignore', 'pipe', 'pipe', fd],
      encoding: 'utf8',
    })
    assert.match(plain.stdout, /fd3 open/u, 'the probe must really hand fd 3 down')
    const { program, args } = withoutInheritedDescriptors('/bin/sh', ['-c', probe, 'x', 'a b'])
    const clean = spawnSync(program, [...args], {
      stdio: ['ignore', 'pipe', 'pipe', fd],
      encoding: 'utf8',
    })
    assert.equal(clean.status, 0)
    assert.equal(clean.stdout.trim(), 'fd3 closed [a b]')
  } finally {
    closeSync(fd)
  }
})
