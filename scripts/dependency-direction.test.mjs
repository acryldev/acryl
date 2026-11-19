import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOrder, directionViolations, findCycles, unlistedFoundation } from './dependency-direction.mjs'

const graphOf = entries => new Map(entries.map(([name, folder, deps, production = deps]) => [name, { folder, deps: new Set(deps), production: new Set(production) }]))

test('a straight graph has no cycle, no violation, and builds the foundation first', () => {
  const graph = graphOf([
    ['acrylblends', 'framework/packages/cli', []],
    ['acryl-control', 'runtime/acryl-control', ['acrylblends']],
    ['acryl-ui', 'plugins/acryl-ui', ['acryl-control', 'acrylblends']],
    ['acryl-desktop', 'apps/acryl-desktop', ['acryl-ui', 'acryl-control']],
  ])
  assert.deepEqual(findCycles(graph), [])
  assert.deepEqual(directionViolations(graph), [])
  assert.deepEqual(buildOrder(graph), ['acrylblends', 'acryl-control', 'acryl-ui', 'acryl-desktop'])
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
    ['acrylblends', 'framework/packages/cli', ['acryl-ui']],
    ['acryl-control', 'runtime/acryl-control', ['acryl-ui']],
    ['acryl-harness-runtime', 'runtime/acryl-harness-runtime', ['@acryl/ui']],
    ['@acryl/ui', 'plugins/acryl-ui', []],
    ['acryl-ui', 'plugins/acryl-ui', ['acryl-desktop']],
    ['acryl-desktop', 'apps/acryl-desktop', []],
  ])
  assert.deepEqual(directionViolations(graph), [
    'acrylblends is framework foundation and depends on acryl-ui: the foundation depends only on itself',
    'acryl-control is ACRYL runtime and depends on acryl-ui: the runtime depends only on the foundation and itself',
    // The composition exception is gone: the composition root's plugin rows are the surfaces' now.
    'acryl-harness-runtime is ACRYL runtime and depends on @acryl/ui: the runtime depends only on the foundation and itself',
    'acryl-ui depends on acryl-desktop, an app: apps are the top, nothing depends on them',
  ])
})

test('the runtime has no plugin exception: any plugin it depends on is named', () => {
  const graph = graphOf([
    ['acryl-harness-runtime', 'runtime/acryl-harness-runtime', ['acryl-workspace', 'acryl-new-plugin']],
    ['acryl-workspace', 'plugins/acryl-workspace', []],
    ['acryl-new-plugin', 'plugins/acryl-new-plugin', []],
  ])
  assert.deepEqual(directionViolations(graph), [
    'acryl-harness-runtime is ACRYL runtime and depends on acryl-workspace: the runtime depends only on the foundation and itself',
    'acryl-harness-runtime is ACRYL runtime and depends on acryl-new-plugin: the runtime depends only on the foundation and itself',
  ])
})

test('a framework package must be named foundation or tool', () => {
  const graph = graphOf([
    ['acrylblends', 'framework/packages/cli', []],
    ['create-acrylblends', 'framework/packages/create', []],
    ['acryl-surprise', 'framework/packages/acryl-surprise', []],
  ])
  assert.deepEqual(unlistedFoundation(graph), [
    'acryl-surprise (framework/packages/acryl-surprise) is a framework package but neither FOUNDATION nor FRAMEWORK_TOOLS names it',
  ])
})

test('a framework app plugin has the plugin role, so the runtime cannot depend on it', () => {
  const graph = graphOf([
    ['acryl-instance', 'plugins/instance', ['acrylblends']],
    ['acrylblends', 'framework/packages/cli', []],
    ['acryl-control', 'runtime/acryl-control', ['acryl-instance']],
  ])
  assert.deepEqual(directionViolations(graph), [
    'acryl-control is ACRYL runtime and depends on acryl-instance: the runtime depends only on the foundation and itself',
  ])
})

test('a plugin the runtime names only in devDependencies is a test edge; a shipped one fails', () => {
  const devOnly = graphOf([
    ['acryl-harness-runtime', 'runtime/acryl-harness-runtime', ['@acryldev/coding-capabilities'], []],
    ['@acryldev/coding-capabilities', 'plugins/coding-capabilities', []],
  ])
  assert.deepEqual(directionViolations(devOnly), [])
  // The same edge in dependencies or peerDependencies is shipped, and fails.
  const shipped = graphOf([
    ['acryl-harness-runtime', 'runtime/acryl-harness-runtime', ['@acryldev/coding-capabilities'], ['@acryldev/coding-capabilities']],
    ['@acryldev/coding-capabilities', 'plugins/coding-capabilities', []],
  ])
  assert.deepEqual(directionViolations(shipped), [
    'acryl-harness-runtime is ACRYL runtime and depends on @acryldev/coding-capabilities: the runtime depends only on the foundation and itself',
  ])
})

test('the foundation depends on the driver contract, never on the panel that uses it', () => {
  const graph = graphOf([
    ['acrylblends-framework', 'framework/packages/framework', ['acryl-drivers']],
    ['acryl-drivers', 'plugins/drivers', []],
    ['acryl-agent-panel', 'plugins/agent-panel', ['acryl-drivers']],
    ['acryl-door', 'plugins/acryl-door', ['acryl-agent-panel']],
  ])
  // The contract is foundation, so the framework may build acrylblends/drivers from it; the panel is a plugin, so the foundation may not reach it.
  assert.deepEqual(directionViolations(graph), [
    'acryl-door is framework foundation and depends on acryl-agent-panel: the foundation depends only on itself',
  ])
})
