/**
 * The profile resolution in src/profile-resolution/ is ported from DeepSeek Harness 0.2.0-rc.2. When the installed DeepSeek Harness or the
 * pinned checkout moves, this fails until the port is redone against the new originals and the hashes below are updated with it.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const ORIGINALS = {
  'packages/boot/app-boot/src/profile-resolution/resolver.ts': 'cf3c2b79646cbacf2475db7841e7bf77c312c1e934f3b42ee87d18db58d806a1',
  'packages/boot/app-boot/src/profile-resolution/service.ts': 'a6086e1d6f91118f803055fbf5a4cfa224f8793ef8ab5539678f38ea793d6ce0',
  'packages/boot/app-boot/tests/profile-resolution.spec.ts': '2549038eb7128f9889f9ffd6a8c2715426494681a82dac5331d875211e10b604',
  'packages/boot/app-boot/tests/profile-resolution-service.spec.ts': 'b46b4ed66f75baddad9030f28fd8254e1c2f120598ff637d48d4ae76c19e05dc',
  'packages/boot/app-boot/tests/hooks-thread-stack.ts': '2e7e7859dc3bff52785caa21f69270470f642d5bd2fdc44c2804f1ccef46c1ca',
} as const

describe('profile resolution port', () => {
  it('runs against the DeepSeek Harness version it was ported from', () => {
    const manifest = createRequire(import.meta.url)('@deepseek-ai/dsh-app-boot/package.json') as { version: string }
    expect(manifest.version).toBe('0.2.0-rc.2')
  })

  it('matches the originals in the pinned DeepSeek Harness checkout', () => {
    for (const [path, sha256] of Object.entries(ORIGINALS)) {
      const text = readFileSync(new URL(`../../../deepseek-harness/${path}`, import.meta.url))
      expect(createHash('sha256').update(text).digest('hex'), path).toBe(sha256)
    }
  })
})
