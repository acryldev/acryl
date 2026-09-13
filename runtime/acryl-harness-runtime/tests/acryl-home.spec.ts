/**
 * `ACRYL_HOME` / `DSH_HOME` precedence for ACRYL's roots.
 *
 * `ACRYL_HOME` is the product root and engines nest beneath it, so an explicit
 * `ACRYL_HOME` must outrank an ambient `DSH_HOME` (commonly exported in a
 * developer shell, and set by the DSH Desktop app). When it did not, pinning
 * ACRYL's root silently kept using the real `~/.dsh`.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAcrylDshHome, resolveAcrylHome } from '../src/acryl-home.ts'

describe('resolveAcrylHome', () => {
  it('uses ACRYL_HOME when set', () => {
    expect(resolveAcrylHome({ ACRYL_HOME: '/tmp/acryl-root' })).toBe('/tmp/acryl-root')
  })

  it('defaults to ~/.acryl, ignoring a blank value', () => {
    expect(resolveAcrylHome({})).toBe(join(homedir(), '.acryl'))
    expect(resolveAcrylHome({ ACRYL_HOME: '   ' })).toBe(join(homedir(), '.acryl'))
  })
})

describe('resolveAcrylDshHome precedence', () => {
  it('nests under ACRYL_HOME even when DSH_HOME is exported', () => {
    expect(resolveAcrylDshHome({ ACRYL_HOME: '/tmp/acryl-root', DSH_HOME: '/tmp/ambient' }))
      .toBe('/tmp/acryl-root/.dsh')
  })

  it('honors DSH_HOME when ACRYL_HOME is unset', () => {
    expect(resolveAcrylDshHome({ DSH_HOME: '/tmp/explicit-dsh' })).toBe('/tmp/explicit-dsh')
  })

  it('defaults to ~/.acryl/.dsh when neither is set', () => {
    expect(resolveAcrylDshHome({})).toBe(join(homedir(), '.acryl', '.dsh'))
    expect(resolveAcrylDshHome({ DSH_HOME: '  ' })).toBe(join(homedir(), '.acryl', '.dsh'))
  })
})
