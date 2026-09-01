import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import webPackage from '../package.json' with { type: 'json' }

const require = createRequire(import.meta.url)
const dshWebPackage = require('@deepseek-ai/dsh-web-app/package.json') as {
  readonly dependencies: Readonly<Record<string, string>>
}
const webDependencies: Readonly<Record<string, string>> = webPackage.dependencies

describe('acryl-web dependency closure', () => {
  it('declares the Web bundle and the Loader runtime it boots', () => {
    const required = [
      '@deepseek-ai/dsh-web-app',
      '@deepseek-ai/dsh-app-boot',
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh',
      '@deepseek-ai/cordis-plugin-loader',
    ]

    expect(dshWebPackage.dependencies).toBeDefined()
    expect(required.filter(name => webDependencies[name] === undefined)).toEqual([])
  })
})
