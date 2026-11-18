/**
 * Which folder the app's command takes for "the app". A parent that only has a `.acryl/` (the person's `~/.acryl` is ACRYL's own home) is not an app, so the
 * command never names it and never reads a door file from it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { findApp } from '../../src/cli/acryl.ts'

const root = mkdtempSync(join(tmpdir(), 'find-app-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('findApp', () => {
  it('a running app is the nearest folder upward with .acryl/door.json', () => {
    const app = join(root, 'running')
    mkdirSync(join(app, '.acryl'), { recursive: true })
    mkdirSync(join(app, 'plugins', 'clock'), { recursive: true })
    writeFileSync(join(app, '.acryl', 'door.json'), '{}')
    expect(findApp(join(app, 'plugins', 'clock'), undefined)).toBe(app)
  })

  it('with no app running, the nearest folder with a blend.yaml is the app, and a home that only has a .acryl is not', () => {
    const home = join(root, 'home')
    const app = join(home, 'work', 'shop')
    mkdirSync(join(home, '.acryl'), { recursive: true })
    mkdirSync(join(app, 'src'), { recursive: true })
    writeFileSync(join(app, 'blend.yaml'), 'metadata: {}\n')
    expect(findApp(join(app, 'src'), undefined)).toBe(app)
    // Run from a folder that is no app at all: nothing is found, rather than the home with its .acryl.
    mkdirSync(join(home, 'elsewhere'), { recursive: true })
    expect(findApp(join(home, 'elsewhere'), undefined)).toBeUndefined()
  })

  it('--dir is taken as given', () => {
    expect(findApp(root, 'x')).toBe(join(root, 'x'))
  })
})
