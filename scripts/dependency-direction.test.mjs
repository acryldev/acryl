import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOrder, directionViolations, findCycles } from './dependency-direction.mjs'

const graphOf = entries => new Map(entries.map(([name, folder, deps]) => [name, { folder, deps: new Set(deps) }]))

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
    ['acryl-harness-runtime', 'runtime/acryl-harness-runtime', ['acryl-ui']],
    ['acryl-ui', 'plugins/acryl-ui', ['acryl-desktop']],
    ['acryl-desktop', 'apps/acryl-desktop', []],
  ])
  assert.deepEqual(directionViolations(graph), [
    'acrylblends is framework foundation and depends on acryl-ui: the foundation depends only on itself',
    'acryl-control is ACRYL runtime and depends on acryl-ui: the runtime depends only on the foundation and itself',
    'acryl-ui depends on acryl-desktop, an app: apps are the top, nothing depends on them',
  ])
})
