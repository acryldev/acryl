import assert from 'node:assert/strict'
import { test } from 'vitest'
import { parse } from 'yaml'
import { OMIT_PLACEHOLDER, OMITTED_PACKAGES } from '../src/frame-omit.ts'
import { FRAME_ALLOW_BUILDS, withFramePnpmSettings } from '../src/pnpm-settings.ts'

test('an app with no pnpm-workspace.yaml gets the flat layout and every frame build allowed', () => {
  const text = withFramePnpmSettings(undefined)
  const settings = parse(text)
  assert.equal(settings.nodeLinker, 'hoisted')
  assert.deepEqual(Object.keys(settings.allowBuilds).sort(), [...FRAME_ALLOW_BUILDS].sort())
  assert.ok(Object.values(settings.allowBuilds).every((value) => value === true))
  assert.ok(text.endsWith('\n'))
})

test('the frame list names the native builds the host needs', () => {
  assert.ok(FRAME_ALLOW_BUILDS.includes('node-pty'))
  assert.ok(FRAME_ALLOW_BUILDS.includes('@deepseek-ai/dsh-subprocess-local'))
})

test('applying twice changes nothing the second time', () => {
  const once = withFramePnpmSettings(undefined)
  assert.equal(withFramePnpmSettings(once), once)
})

test('a key the person set is kept: their own nodeLinker and an inline allowBuilds are not touched', () => {
  const theirs = 'nodeLinker: isolated\nallowBuilds: {}\n'
  assert.equal(withFramePnpmSettings(theirs, FRAME_ALLOW_BUILDS, {}), theirs)
  assert.ok(withFramePnpmSettings(theirs).startsWith(theirs))
})

test('what the frame omits (the LibreOffice engines) becomes the empty placeholder, as npm overrides it', () => {
  const settings = parse(withFramePnpmSettings(undefined))
  assert.ok(OMITTED_PACKAGES.includes('@deepseek-ai/libreoffice-kit-darwin-arm64'))
  assert.deepEqual(
    settings.overrides,
    Object.fromEntries(OMITTED_PACKAGES.map((name) => [name, `npm:${OMIT_PLACEHOLDER}`])),
  )
})

test("an overrides block of the person's keeps their values and gets only the missing names", () => {
  const theirs =
    "overrides:\n  '@deepseek-ai/libreoffice-kit-darwin-arm64': 0.1.5\n  left-pad: 1.0.0\n"
  const settings = parse(withFramePnpmSettings(theirs, []))
  assert.equal(settings.overrides['@deepseek-ai/libreoffice-kit-darwin-arm64'], '0.1.5')
  assert.equal(settings.overrides['left-pad'], '1.0.0')
  assert.equal(
    settings.overrides['@deepseek-ai/libreoffice-kit-win32-x64'],
    `npm:${OMIT_PLACEHOLDER}`,
  )
})

test('a block allowBuilds gets only the missing names, after its last entry, and a denied name stays denied', () => {
  const theirs = [
    'packages:',
    "  - '.'",
    'allowBuilds:',
    '  esbuild: true',
    '  koffi: false',
    '',
    '# their note',
    'minimumReleaseAgeExclude:',
    '  - foo',
    '',
  ].join('\n')
  const text = withFramePnpmSettings(theirs, ['koffi', 'node-pty', '@google/genai'])
  const settings = parse(text)
  assert.deepEqual(settings.allowBuilds, {
    esbuild: true,
    koffi: false,
    'node-pty': true,
    '@google/genai': true,
  })
  assert.deepEqual(settings.packages, ['.'])
  assert.deepEqual(settings.minimumReleaseAgeExclude, ['foo'])
  assert.equal(settings.nodeLinker, 'hoisted')
  assert.match(text, /# their note\nminimumReleaseAgeExclude:/u)
})

test('a file without a trailing newline is extended cleanly', () => {
  const text = withFramePnpmSettings('packages:\n  - .', [])
  assert.equal(text, `packages:\n  - .\n${text.split('\n').slice(2).join('\n')}`)
  assert.equal(parse(text).nodeLinker, 'hoisted')
  assert.equal(parse(text).allowBuilds, undefined)
})
