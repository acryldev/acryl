import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import desktopPackage from '../package.json' with { type: 'json' }

const require = createRequire(import.meta.url)
const webPackage = require('@deepseek-ai/dsh-web-app/package.json') as {
  readonly dependencies: Readonly<Record<string, string>>
}
const desktopDependencies: Readonly<Record<string, string>> = desktopPackage.dependencies

describe('Desktop Web profile dependency closure', () => {
  it('declares every dynamically loaded dependency of the pinned Web bundle', () => {
    const missing = Object.keys(webPackage.dependencies)
      .filter(name => desktopDependencies[name] === undefined)

    expect(missing).toEqual([])
  })
})
