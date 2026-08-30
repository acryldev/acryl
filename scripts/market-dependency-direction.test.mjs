import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyMarketDependencyDirection } from './market-dependency-direction.mjs'

test('allows product-name data in Market source', () => {
  assert.deepEqual(verifyMarketDependencyDirection([
    ['dsh-community-market/src/install.ts', "const blocked = new Set(['acryl-desktop'])\n"],
  ]), { fileCount: 1 })
})

test('rejects Market imports of Desktop implementation', () => {
  assert.throws(() => verifyMarketDependencyDirection([
    ['dsh-community-market/src/index.ts', "import type { DesktopRuntime } from 'acryl-desktop/runtime'\n"],
  ]), /must not import Desktop implementation/u)
  assert.throws(() => verifyMarketDependencyDirection([
    ['dsh-community-market/src/index.ts', "const desktop = await import('acryl-desktop')\n"],
  ]), /must not import Desktop implementation/u)
  assert.throws(() => verifyMarketDependencyDirection([
    ['dsh-community-market/src/index.ts', "export { runtime } from '../../acryl-desktop/src/runtime.js'\n"],
  ]), /must not import Desktop implementation/u)
})
