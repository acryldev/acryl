/**
 * The frame reuses a stored launch token by assigning the one field DSH's connection package reads. That is a deliberate seam on a pinned dependency, so
 * it fails loudly here when a DSH bump moves it: the test reads the installed package and asserts that (a) the browser authentication still keeps the
 * token in the instance field `launchToken`, assigned once in its constructor from `processLaunchToken`, and (b) every admission and URL path reads
 * that field - no other call site mints or compares a per-process token (the WebSocket admission admits through the cookie, so the token never enters
 * it directly). A package that moved, renamed or re-minted the token makes this test fail with the paths it reads.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it } from 'vitest'

const root = resolve(import.meta.dirname, '..', '..', '..')

/** The installed `@deepseek-ai/dsh-client-connection` folder, from the workspace's pnpm store. */
function connectionPackage(): string {
  const store = join(root, 'node_modules', '.pnpm')
  if (!existsSync(store))
    throw new Error(`no pnpm store at ${store}; the workspace is not installed`)
  const entry = readdirSync(store).find((name) =>
    name.startsWith('@deepseek-ai+dsh-client-connection@'),
  )
  if (entry === undefined)
    throw new Error(
      'the pinned @deepseek-ai/dsh-client-connection is not installed; the frame token seam cannot be checked',
    )
  return join(store, entry, 'node_modules', '@deepseek-ai', 'dsh-client-connection')
}

describe("DSH's launch-token seam", () => {
  it('keeps the token in the field the launcher assigns, and reads that field on every path', () => {
    const folder = connectionPackage()
    const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as {
      version?: string
    }
    const source = readFileSync(join(folder, 'lib', 'index.js'), 'utf8')
    // (a) The field exists and is set once, in the constructor, from the per-process mint.
    assert.match(
      source,
      /this\.launchToken = processLaunchToken\(processOwner\);/u,
      `dsh-client-connection ${String(manifest.version)} no longer assigns browserAuth.launchToken in its constructor; the frame's reused-token seam needs a new home`,
    )
    // (b) The URL builder and the index admission read the field, never a fresh mint.
    assert.match(
      source,
      /url\.searchParams\.set\(TOKEN_QUERY, this\.launchToken\);/u,
      'authenticatedUrl no longer reads this.launchToken; the printed address would not carry the reused token',
    )
    assert.match(
      source,
      /tokenMatches\(tokens\.join\(""\), this\.launchToken\)/u,
      'the index admission no longer compares against this.launchToken; a reused token would be refused at the page',
    )
    // No other call mints a process token: the function definition plus the constructor assignment are all.
    const calls = [...source.matchAll(/processLaunchToken\(([^)]*)\)/gu)].map((match) => match[0])
    assert.equal(
      calls.length,
      2,
      `processLaunchToken is called in more places than the constructor (${calls.length} matches: ${calls.join(', ')}); another admission path may be reading a per-process token instead of the field`,
    )
    const definition = calls.filter((call) => call === 'processLaunchToken(owner)')
    const assignment = calls.filter((call) => call === 'processLaunchToken(processOwner)')
    assert.equal(definition.length, 1, 'the processLaunchToken definition changed shape')
    assert.equal(
      assignment.length,
      1,
      'the only processLaunchToken call is no longer the constructor assignment',
    )
  })
})
