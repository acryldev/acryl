import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateCopies } from './one-copy.mjs'

test('an @acryldev package at two versions anywhere in the tree is named, one at a single version is not', () => {
  const tree = {
    dependencies: {
      '@acryldev/sign-in': {
        version: '0.2.3',
        dependencies: { '@acryldev/control': { version: '0.3.1' } },
      },
      '@acryldev/workspace': {
        version: '0.2.3',
        dependencies: { '@acryldev/control': { version: '0.3.0' } },
      },
      '@acryldev/blends': {
        version: '1.7.28',
        dependencies: { '@acryldev/blends-core': { version: '0.6.2' } },
      },
      '@acryldev/blends-core': { version: '0.6.2' },
      react: { version: '18.3.1', dependencies: { react: { version: '17.0.0' } } },
    },
  }
  assert.deepEqual(duplicateCopies(tree), [
    { name: '@acryldev/control', versions: ['0.3.0', '0.3.1'] },
  ])
  assert.deepEqual(duplicateCopies({}), [])
})
