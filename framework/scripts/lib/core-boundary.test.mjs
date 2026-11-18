import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { boundaryViolations, forbiddenReason, importsOf } from './core-boundary.mjs'

test('the core may use Cordis, schemastery, node and its own files', () => {
  for (const name of [
    '@deepseek-ai/cordis',
    '@deepseek-ai/schemastery',
    '@deepseek-ai/cosmokit',
    'schemastery',
    'node:fs',
    './routes.ts',
    '../acryl-router/src/index.ts',
    '@webboxes/blends-core',
    'yaml',
  ]) {
    assert.equal(forbiddenReason(name), undefined, name)
  }
})

test('the agent pack, drivers, model vendors, the frame and DSH packages are outside the core', () => {
  assert.equal(forbiddenReason('agent-panel'), 'the agent pack')
  assert.equal(forbiddenReason('../agents/index.ts'), 'the agent pack')
  assert.equal(forbiddenReason('./agent.ts'), 'the agent pack')
  assert.equal(forbiddenReason('driver-pty'), 'a driver')
  assert.equal(forbiddenReason('openai'), 'a model vendor')
  assert.equal(forbiddenReason('@anthropic-ai/sdk'), 'a model vendor')
  assert.equal(forbiddenReason('@acrylblends/blends-frame'), 'the frame')
  assert.equal(forbiddenReason('acryl-blends-frame/client'), 'the frame')
  assert.equal(forbiddenReason('@deepseek-ai/dsh-agent'), 'a DSH package (the agent engine)')
  // A name that only contains the word is not the agent pack.
  assert.equal(forbiddenReason('user-agent'), undefined)
  assert.equal(forbiddenReason('./reagent.ts'), undefined)
})

test('imports of every kind are found, and a comment is not an import', () => {
  const text = [
    "import { Context } from '@deepseek-ai/cordis'",
    "import type { X } from './types.ts'",
    "export * from './routes.ts'",
    "import './side-effect.ts'",
    "const panel = await import('agent-panel')",
    "const pty = require('driver-pty')",
    "// import { nope } from 'openai'",
    "/* const late = import('agent-x') */",
    "const url = 'https://example.com' // not an import",
  ].join('\n')
  assert.deepEqual(
    importsOf(text).sort(),
    [
      './routes.ts',
      './side-effect.ts',
      './types.ts',
      '@deepseek-ai/cordis',
      'agent-panel',
      'driver-pty',
    ].sort(),
  )
})

test('an app folder is read with the line of each offending import and its installed closure', () => {
  const app = mkdtempSync(join(tmpdir(), 'core-boundary-'))
  try {
    mkdirSync(join(app, 'plugins', 'door', 'src'), { recursive: true })
    mkdirSync(join(app, 'node_modules', 'agent-panel'), { recursive: true })
    writeFileSync(
      join(app, 'plugins', 'door', 'src', 'index.ts'),
      "import { Context } from '@deepseek-ai/cordis'\nconst a = await import('agent-panel')\n",
    )
    writeFileSync(join(app, 'node_modules', 'agent-panel', 'index.js'), "import 'openai'\n")
    writeFileSync(
      join(app, 'package-lock.json'),
      JSON.stringify({
        packages: {
          '': {},
          'node_modules/schemastery': {},
          'node_modules/x/node_modules/openai': {},
        },
      }),
    )
    assert.deepEqual(boundaryViolations(app), [
      { where: 'plugins/door/src/index.ts:2', name: 'agent-panel', why: 'the agent pack' },
      { where: 'installed', name: 'node_modules/x/node_modules/openai', why: 'a model vendor' },
    ])
  } finally {
    rmSync(app, { recursive: true, force: true })
  }
})
