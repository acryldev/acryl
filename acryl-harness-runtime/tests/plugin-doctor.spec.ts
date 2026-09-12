import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginLifecycleEntryView, PluginLifecycleSnapshot } from 'acryl-control'
import { diagnosePluginLifecycle } from '../src/plugin-doctor.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempDir(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

/** A profile directory with the given `dsh.profile.bundles` list. */
function profileDir(bundles: readonly string[]): string {
  const dir = tempDir('dsh-doctor-profile-')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acryl-profile', dsh: { profile: { bundles } } }))
  return dir
}

function statePath(contents?: string): string {
  const dir = tempDir('dsh-doctor-state-')
  const path = join(dir, 'plugin-lifecycle', 'state.json')
  if (contents !== undefined) {
    mkdirSync(join(dir, 'plugin-lifecycle'), { recursive: true })
    writeFileSync(path, contents)
  }
  return path
}

function entry(
  entryId: string,
  overrides: Partial<PluginLifecycleEntryView> = {},
): PluginLifecycleEntryView {
  return {
    entryId,
    moduleName: 'acryl-plugin',
    enabled: true,
    hostPhase: 'active',
    mutable: true,
    protectedReason: null,
    dependents: [],
    ...overrides,
  }
}

function snapshot(entries: readonly PluginLifecycleEntryView[]): PluginLifecycleSnapshot {
  return { entries }
}

function disabledState(profileName: string, entryIds: readonly string[]): string {
  return JSON.stringify({ version: 1, profiles: [{ profileName, disabledEntries: entryIds }] })
}

describe('diagnosePluginLifecycle', () => {
  it('reports a healthy profile with no findings', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir([]),
      statePath: statePath(),
      snapshot: snapshot([entry('include:ui-acryl')]),
    })

    expect(report).toMatchObject({
      profileName: 'acryl',
      pluginCount: 1,
      findings: [],
    })
    expect(report.statePath).toContain('plugin-lifecycle')
  })

  it('accepts an override written as a patch id for a composed entry', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir([]),
      statePath: statePath(disabledState('acryl', ['ui-acryl'])),
      snapshot: snapshot([entry('include:ui-acryl')]),
    })

    expect(report.findings).toEqual([])
  })

  it('warns about an override that outlived its entry', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir([]),
      statePath: statePath(disabledState('acryl', ['include:removed-plugin'])),
      snapshot: snapshot([entry('include:ui-acryl')]),
    })

    expect(report.findings).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'stale-override', entryId: 'include:removed-plugin' }),
    ])
  })

  it('warns about an override on an entry the user does not control', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir([]),
      statePath: statePath(disabledState('acryl', ['include:ui-brand-official'])),
      snapshot: snapshot([
        entry('include:ui-brand-official', { mutable: false, protectedReason: 'compatibility mode' }),
      ]),
    })

    expect(report.findings).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'unmanaged-override' }),
    ])
  })

  it('ignores another profile\'s overrides', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir([]),
      statePath: statePath(disabledState('desktop', ['include:gone'])),
      snapshot: snapshot([entry('include:ui-acryl')]),
    })

    expect(report.findings).toEqual([])
  })

  it('fails closed when the override file cannot be parsed', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir([]),
      statePath: statePath('{ not json'),
      snapshot: snapshot([entry('include:ui-acryl')]),
    })

    expect(report.findings).toEqual([
      expect.objectContaining({ severity: 'error', code: 'state-unreadable' }),
    ])
  })

  it('warns when a user bundle composes nothing, and errors when it cannot resolve', () => {
    const dir = profileDir(['acryl-dsh-editor-plugin', 'acryl-plugin-gone'])
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: dir,
      statePath: statePath(),
      snapshot: snapshot([entry('include:ui-acryl', { moduleName: '@acryl/dsh-client-ui-brand-acryl' })]),
      resolvePackageJson: packageName => {
        if (packageName === 'acryl-plugin-gone') throw new Error('Cannot find module')
        return join(dir, 'node_modules', packageName, 'package.json')
      },
    })

    expect(report.findings).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'bundle-not-composed', entryId: 'acryl-dsh-editor-plugin' }),
      expect.objectContaining({ severity: 'error', code: 'bundle-missing', entryId: 'acryl-plugin-gone' }),
    ])
  })

  it('matches a composed row whose module name is a subpath of the bundle', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir(['acryl-dsh-editor-plugin']),
      statePath: statePath(),
      snapshot: snapshot([entry('include:dsh-editor', { moduleName: 'acryl-dsh-editor-plugin/dist/host.js' })]),
      resolvePackageJson: () => '/x/package.json',
    })

    expect(report.findings).toEqual([])
  })

  it('never treats a base template bundle as user-mutable', () => {
    const report = diagnosePluginLifecycle({
      profileName: 'acryl',
      profileDir: profileDir(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']),
      statePath: statePath(),
      snapshot: snapshot([]),
      resolvePackageJson: () => { throw new Error('should not be asked') },
    })

    expect(report.findings).toEqual([])
  })
})
