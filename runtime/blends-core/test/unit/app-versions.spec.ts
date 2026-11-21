import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appVersions, appVersionsLine, readAppVersions } from '../../src/index.js'

const manifest = 'apiVersion: acrylblends.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: me.csv-explorer\n  name: CSV Explorer\n  version: 0.1.4\n'

describe('appVersions', () => {
  it('reads the Blend from blend.yaml and the framework from its installed package, else from the range the app declares', () => {
    const appPackage = JSON.stringify({ dependencies: { '@acryldev/blends': '^1.7.0' } })
    expect(appVersions({ manifest, frameworkPackage: '{"version":"1.7.21"}', appPackage })).toEqual({ blend: '0.1.4', framework: '1.7.21' })
    expect(appVersions({ manifest, appPackage })).toEqual({ blend: '0.1.4', framework: '^1.7.0' })
    expect(appVersions({ manifest: 'not: [yaml', appPackage: 'not json' })).toEqual({})
  })

  it('says both in one line and leaves a missing one out', () => {
    expect(appVersionsLine('csv-explorer', { blend: '0.1.4', framework: '1.7.21' })).toBe('csv-explorer 0.1.4 · ACRYL Blends 1.7.21')
    expect(appVersionsLine('csv-explorer', { framework: '1.7.21' })).toBe('csv-explorer · ACRYL Blends 1.7.21')
    expect(appVersionsLine('csv-explorer', {})).toBe('csv-explorer')
  })

  it('reads an app folder, the framework from the folder Node resolves it in', () => {
    const app = mkdtempSync(join(tmpdir(), 'acryl-versions-'))
    const bundle = mkdtempSync(join(tmpdir(), 'acryl-versions-bundle-'))
    try {
      writeFileSync(join(app, 'blend.yaml'), manifest)
      const install = (folder: string, version: string): void => {
        writeFileSync(join(folder, 'package.json'), JSON.stringify({ dependencies: { '@acryldev/blends': '^1.7.0' } }))
        mkdirSync(join(folder, 'node_modules', '@acryldev', 'blends'), { recursive: true })
        writeFileSync(join(folder, 'node_modules', '@acryldev', 'blends', 'package.json'), JSON.stringify({ name: '@acryldev/blends', version }))
      }
      install(app, '1.7.20')
      install(bundle, '1.7.21')
      expect(readAppVersions(app)).toEqual({ blend: '0.1.4', framework: '1.7.20' })
      expect(readAppVersions(app, bundle)).toEqual({ blend: '0.1.4', framework: '1.7.21' })
    } finally {
      rmSync(app, { recursive: true, force: true })
      rmSync(bundle, { recursive: true, force: true })
    }
  })
})
