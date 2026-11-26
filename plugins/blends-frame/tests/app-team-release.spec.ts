// Share with team from an app's own Settings > Share (spec 052 T061, WebBoxes.ai): when it may start, and how the command's lines become what the page reads.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveGithub } from '@acryldev/app-persistence'
import { afterEach, expect, it } from 'vitest'
import { AppTeamReleaseRefused, appTeamRelease, type Launch } from '../src/app-team-release.ts'
import { parseAppTeamRelease } from '../src/contract.ts'

const homes: string[] = []
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })
const home = (scopes?: readonly string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-team-'))
  homes.push(dir)
  if (scopes !== undefined) saveGithub(dir, 'gho_abcdefghijklmnopqrstuvwxyz0123', 'ana', scopes)
  return dir
}

it('starts only on a GitHub connection that may push a workflow, once at a time', () => {
  const never: Launch = () => { throw new Error('not started') }
  expect(() => appTeamRelease('/app', home(), never).start()).toThrow(/Connect GitHub first/u)
  expect(() => appTeamRelease('/app', home(['repo']), never).start()).toThrow(AppTeamReleaseRefused)
  expect(() => appTeamRelease('/app', home(['repo']), never).start()).toThrow(/workflow permission.*Connect GitHub again/u)
  const quiet: Launch = () => {}
  const port = appTeamRelease('/app', home(['repo', 'workflow']), quiet)
  expect(port.start()).toEqual({ status: 'running', step: 'Starting' })
  expect(() => port.start()).toThrow(/already running/u)
})

it('reads the command\'s steps, its release page, its refusal, and a run that ended without one', () => {
  let say: (line: string) => void = () => {}
  let end: (code: number | null) => void = () => {}
  const launch: Launch = (root, onLine, onEnd) => { expect(root).toBe('/app'); say = onLine; end = onEnd }
  const port = appTeamRelease('/app', home(['repo', 'workflow']), launch)
  port.start()
  say('npm warn something')
  say('acryl-team: step: GitHub is building the installers: 1 of 5 steps done')
  expect(port.view()).toEqual({ status: 'running', step: 'GitHub is building the installers: 1 of 5 steps done' })
  say('acryl-team: release: https://github.com/ana/shop/releases/tag/v0.1.0')
  end(0)
  expect(port.view()).toEqual({ status: 'done', link: 'https://github.com/ana/shop/releases/tag/v0.1.0' })
  port.start()
  say('acryl-team: failed: the app is not on GitHub yet: Share to GitHub first')
  end(1)
  expect(port.view()).toEqual({ status: 'failed', reason: 'the app is not on GitHub yet: Share to GitHub first' })
  port.start()
  end(137)
  expect(port.view()).toMatchObject({ status: 'failed', reason: /ended with 137/u })
  expect(parseAppTeamRelease({ status: 'done', link: 'https://evil.example/x' })).toBeUndefined()
})
