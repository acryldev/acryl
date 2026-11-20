/** Where an app's frame specs come from on `upgrade`: the environment, the app's own pins (source or published names), npm for a desktop app. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  FRAME_RELEASE,
  frameProfileForApp,
  frameProfileInput,
  publishedFrameProfile,
} from '../src/frame-release.ts'
import { VERSION } from '../src/version.ts'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-frame-release-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.ACRYLBLENDS_FRAME_PACKAGES
})

function app(name: string, dependencies: Record<string, string>, desktop = false): string {
  const root = join(scratch, name)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name, dependencies }))
  if (desktop) mkdirSync(join(root, 'plugins', 'desktop-shell'), { recursive: true })
  return root
}

const web = FRAME_RELEASE.find((entry) => entry.source === '@acryldev/web')

describe('the frame specs of an existing app', () => {
  it('an app on the published frame upgrades from its own pins, by the names it installed', () => {
    const root = app('on-npm', {
      '@deepseek-ai/dsh-base': '0.2.0-rc.2',
      '@acryldev/blends': '^1.2.0',
      [String(web?.name)]: '^0.1.0',
    })
    const specs = frameProfileForApp(root)
    expect(specs?.packages['@acryldev/web']).toBe('^0.1.0')
    // The framework moves to this CLI's release, so the frame step does not write the old range back after the upgrade bumped it.
    expect(specs?.frameworkVersion).toBe(`^${VERSION}`)
    const input = frameProfileInput(specs ?? publishedFrameProfile(), 'on-npm', [])
    expect(input.dependencies?.[String(web?.name)]).toBe('^0.1.0')
    const row = input.packages?.find((entry) => entry.row === 'acryl-web-service')
    expect(row?.name).toBe(web?.name)
  })

  it('a checkout app keeps its file: specs under the source names', () => {
    const root = app('on-checkout', {
      '@deepseek-ai/dsh-base': '0.2.0-rc.2',
      '@acryldev/blends': 'file:/checkout/packages/cli',
      '@acryldev/web': 'file:/checkout/runtime/web',
    })
    const input = frameProfileInput(frameProfileForApp(root) ?? publishedFrameProfile(), 'x', [])
    expect(input.dependencies?.['@acryldev/web']).toBe('file:/checkout/runtime/web')
    expect(input.frameworkVersion).toBe('file:/checkout/packages/cli')
    // The row id is the package name (T025), so a checkout app and a published one compose the same row.
    expect(input.packages?.find((entry) => entry.row === 'acryl-web-service')?.name).toBe(
      '@acryldev/web',
    )
  })

  it('a desktop app with no frame yet gets the published frame; a web app and ACRYLBLENDS_FRAME_PACKAGES=none stay on the framework alone', () => {
    expect(frameProfileForApp(app('desktop', {}, true))).toEqual(publishedFrameProfile())
    expect(frameProfileForApp(app('web', {}))).toBeUndefined()
    // create runs `add desktop-shell` then `upgrade` before npm install: the declared package already makes it a desktop app.
    expect(
      frameProfileForApp(app('desktop-declared', { '@acryldev/desktop-shell': '0.1.2' })),
    ).toEqual(publishedFrameProfile())
    process.env.ACRYLBLENDS_FRAME_PACKAGES = 'none'
    expect(frameProfileForApp(app('desktop-none', {}, true))).toBeUndefined()
  })
})
