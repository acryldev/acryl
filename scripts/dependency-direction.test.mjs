import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOrder, directionViolations, findCycles, unlistedFoundation } from './dependency-direction.mjs'

const graphOf = entries => new Map(entries.map(([name, folder, deps, production = deps]) => [name, { folder, deps: new Set(deps), production: new Set(production) }]))

test('a straight graph has no cycle, no violation, and builds the foundation first', () => {
  const graph = graphOf([
    ['@acryldev/blends', 'framework/packages/cli', []],
    ['@acryldev/control', 'runtime/control', ['@acryldev/blends']],
    ['acryl-ui', 'plugins/ui', ['@acryldev/control', '@acryldev/blends']],
    ['acryl-desktop', 'apps/acryl-desktop', ['acryl-ui', '@acryldev/control']],
  ])
  assert.deepEqual(findCycles(graph), [])
  assert.deepEqual(directionViolations(graph), [])
  assert.deepEqual(buildOrder(graph), ['@acryldev/blends', '@acryldev/control', 'acryl-ui', 'acryl-desktop'])
})

test('a cycle is reported as its path', () => {
  const graph = graphOf([
    ['a', 'plugins/a', ['b']],
    ['b', 'plugins/b', ['a']],
  ])
  assert.deepEqual(findCycles(graph), [['a', 'b', 'a']])
})

test('each wrong-way dependency is named', () => {
  const graph = graphOf([
    ['@acryldev/blends', 'framework/packages/cli', ['acryl-ui']],
    ['@acryldev/control', 'runtime/control', ['acryl-ui']],
    ['@acryldev/harness-runtime', 'runtime/harness-runtime', ['@acryldev/ui']],
    ['@acryldev/ui', 'plugins/ui', []],
    ['acryl-ui', 'plugins/ui', ['acryl-desktop']],
    ['acryl-desktop', 'apps/acryl-desktop', []],
  ])
  assert.deepEqual(directionViolations(graph), [
    '@acryldev/blends is framework foundation and depends on acryl-ui: the foundation depends only on itself',
    '@acryldev/control is ACRYL runtime and depends on acryl-ui: the runtime depends only on the foundation and itself',
    // The composition exception is gone: the composition root's plugin rows are the surfaces' now.
    '@acryldev/harness-runtime is ACRYL runtime and depends on @acryldev/ui: the runtime depends only on the foundation and itself',
    'acryl-ui depends on acryl-desktop, an app: apps are the top, nothing depends on them',
  ])
})

test('the runtime has no plugin exception: any plugin it depends on is named', () => {
  const graph = graphOf([
    ['@acryldev/harness-runtime', 'runtime/harness-runtime', ['@acryldev/workspace', 'acryl-new-plugin']],
    ['@acryldev/workspace', 'plugins/workspace', []],
    ['acryl-new-plugin', 'plugins/acryl-new-plugin', []],
  ])
  assert.deepEqual(directionViolations(graph), [
    '@acryldev/harness-runtime is ACRYL runtime and depends on @acryldev/workspace: the runtime depends only on the foundation and itself',
    '@acryldev/harness-runtime is ACRYL runtime and depends on acryl-new-plugin: the runtime depends only on the foundation and itself',
  ])
})

test('a framework package must be named foundation or tool', () => {
  const graph = graphOf([
    ['@acryldev/blends', 'framework/packages/cli', []],
    ['create-acrylblends', 'framework/packages/create', []],
    ['acryl-surprise', 'framework/packages/acryl-surprise', []],
  ])
  assert.deepEqual(unlistedFoundation(graph), [
    'acryl-surprise (framework/packages/acryl-surprise) is a framework package but neither FOUNDATION nor FRAMEWORK_TOOLS names it',
  ])
})

test('a framework app plugin has the plugin role, so the runtime cannot depend on it', () => {
  const graph = graphOf([
    ['@acryldev/instance', 'plugins/instance', ['@acryldev/blends']],
    ['@acryldev/blends', 'framework/packages/cli', []],
    ['@acryldev/control', 'runtime/control', ['@acryldev/instance']],
  ])
  assert.deepEqual(directionViolations(graph), [
    '@acryldev/control is ACRYL runtime and depends on @acryldev/instance: the runtime depends only on the foundation and itself',
  ])
})

test('a plugin the runtime names only in devDependencies is a test edge; a shipped one fails', () => {
  const devOnly = graphOf([
    ['@acryldev/harness-runtime', 'runtime/harness-runtime', ['@acryldev/coding-capabilities'], []],
    ['@acryldev/coding-capabilities', 'plugins/coding-capabilities', []],
  ])
  assert.deepEqual(directionViolations(devOnly), [])
  // The same edge in dependencies or peerDependencies is shipped, and fails.
  const shipped = graphOf([
    ['@acryldev/harness-runtime', 'runtime/harness-runtime', ['@acryldev/coding-capabilities'], ['@acryldev/coding-capabilities']],
    ['@acryldev/coding-capabilities', 'plugins/coding-capabilities', []],
  ])
  assert.deepEqual(directionViolations(shipped), [
    '@acryldev/harness-runtime is ACRYL runtime and depends on @acryldev/coding-capabilities: the runtime depends only on the foundation and itself',
  ])
})

test('the foundation depends on the driver contract, never on the panel that uses it', () => {
  const graph = graphOf([
    ['@acryldev/framework', 'framework/packages/framework', ['@acryldev/drivers']],
    ['@acryldev/drivers', 'plugins/drivers', []],
    ['@acryldev/agent-panel', 'plugins/agent-panel', ['@acryldev/drivers']],
    ['@acryldev/door', 'plugins/door', ['@acryldev/agent-panel']],
  ])
  // The contract is foundation, so the framework may build acrylblends/drivers from it; the panel is a plugin, so the foundation may not reach it.
  assert.deepEqual(directionViolations(graph), [
    '@acryldev/door is framework foundation and depends on @acryldev/agent-panel: the foundation depends only on itself',
  ])
})
