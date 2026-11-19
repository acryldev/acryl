/** One profile, one live installation (spec 036): the guard that would have stopped a worktree run from re-linking a running app's profile. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PROFILE_OWNER_FILE, ProfileInUseError, claimProfile } from '../src/profile-owner.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const profile = (): string => { const dir = mkdtempSync(join(tmpdir(), 'acryl-owner-')); dirs.push(dir); return dir }

describe('claimProfile', () => {
  it('a different installation cannot take a profile whose owner is running, and is told who holds it', () => {
    const dir = profile()
    claimProfile(dir, '/installs/main', 100, () => true)
    expect(() => claimProfile(dir, '/installs/worktree', 200, () => true)).toThrow(ProfileInUseError)
    expect(() => claimProfile(dir, '/installs/worktree', 200, () => true)).toThrow(/\/installs\/main, pid 100/)
    expect(JSON.parse(readFileSync(join(dir, PROFILE_OWNER_FILE), 'utf8')).installRoot).toBe('/installs/main')   // untouched
  })

  it('the same installation may always boot it (a Web server and a CLI of one checkout)', () => {
    const dir = profile()
    claimProfile(dir, '/installs/main', 100, () => true)
    expect(() => claimProfile(dir, '/installs/main', 101, () => true)).not.toThrow()
  })

  it('a stopped or crashed owner is taken over', () => {
    const dir = profile()
    claimProfile(dir, '/installs/main', 100, () => true)
    claimProfile(dir, '/installs/worktree', 200, () => false)
    expect(JSON.parse(readFileSync(join(dir, PROFILE_OWNER_FILE), 'utf8'))).toMatchObject({ installRoot: '/installs/worktree', pid: 200 })
  })

  it('a missing or unreadable owner file is no owner', () => {
    const dir = profile()
    expect(() => claimProfile(dir, '/installs/a', 1, () => true)).not.toThrow()
  })
})
