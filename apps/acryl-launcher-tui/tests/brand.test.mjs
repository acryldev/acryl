import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visibleWidth } from '@earendil-works/pi-tui'
import { MARK_WIDTH, SPINNER, colorEnabled, gradient, markLines, sectionTitle, shimmerAt, spectrumAt, spinnerFrame, wordmark } from '../brand.js'

// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
const plain = text => text.replace(/\x1b\[[0-9;]*m/gu, '')
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escape sequences
const colors = text => text.match(/\x1b\[38;2;([0-9;]+)m/gu) ?? []

test('colors: off for NO_COLOR, TERM=dumb and a pipe; FORCE_COLOR turns them on', () => {
  assert.equal(colorEnabled({}, true), true)
  assert.equal(colorEnabled({ NO_COLOR: '1' }, true), false)
  assert.equal(colorEnabled({ TERM: 'dumb' }, true), false)
  assert.equal(colorEnabled({}, false), false)
  assert.equal(colorEnabled({ FORCE_COLOR: '1' }, false), true)
  assert.equal(colorEnabled({ NO_COLOR: '1', FORCE_COLOR: '1' }, true), false)
})

test('the spectrum runs cyan to amber, deeper on a light terminal', () => {
  assert.deepEqual(spectrumAt(0), [34, 211, 238])
  assert.deepEqual(spectrumAt(1), [245, 158, 11])
  assert.deepEqual(spectrumAt(0, 'light'), [8, 145, 178])
  assert.deepEqual(spectrumAt(-1), spectrumAt(0))
})

test('a gradient keeps the text, colors every visible character, and leaves spaces bare', () => {
  const painted = gradient('AC RYL')
  assert.equal(plain(painted), 'AC RYL')
  assert.equal(colors(painted).length, 5)
  assert.equal(gradient('ACRYL', { color: false }), 'ACRYL')
  assert.notEqual(gradient('ACRYL', { shimmer: 0.5 }), gradient('ACRYL'), 'the shimmer brightens a band')
})

test('the mark: centred when it fits, absent when it does not; the wordmark and titles fit their width', () => {
  assert.equal(markLines(MARK_WIDTH - 1), undefined)
  const lines = markLines(80, { color: false })
  assert.equal(lines.length, 11)
  for (const line of lines) assert.ok(visibleWidth(line) <= 80)
  assert.equal(plain(wordmark({ color: false })), '▲ ACRYL  Control Center')
  assert.equal(visibleWidth(sectionTitle('Your apps', 40)), 40)
  assert.equal(sectionTitle('Apps', 20, { color: false }), 'APPS ───────────────')
})

test('the spinner cycles and the shimmer ends', () => {
  assert.equal(spinnerFrame(0), SPINNER[0])
  assert.equal(spinnerFrame(SPINNER.length + 1), SPINNER[1])
  assert.equal(shimmerAt(0), 0)
  assert.equal(shimmerAt(1000), undefined)
})
