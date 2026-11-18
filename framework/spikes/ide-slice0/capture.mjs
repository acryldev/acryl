#!/usr/bin/env node
// Open the page in headless Chrome and report what it cost and what it shows.
//   node capture.mjs <url> <screenshot prefix> [--settings] [--terminal]
// Prints one JSON line: load and first-render time, requests, bytes on the wire (gzip) and decoded, JS heap, the title, and with --terminal whether a typed command reached a real PTY.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { chromeFlags, devtools, findChrome } = await import(
  join(root, 'scripts', 'lib', 'door-probe.mjs')
)
const [url, prefix, ...flags] = process.argv.slice(2)
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(
  findChrome(),
  [...chromeFlags(mkdtempSync(join(tmpdir(), 'capture-')), port), '--window-size=1440,900'],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
  for (let i = 0; i < 200; i += 1) {
    if (
      await fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break
    await sleep(50)
  }
  const cdp = await devtools(port)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  const ev = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value
  const shot = async (name) =>
    writeFileSync(
      `${prefix}-${name}.png`,
      Buffer.from(
        (await cdp.send('Page.captureScreenshot', { format: 'png' })).result.data,
        'base64',
      ),
    )
  const click = (text) =>
    ev(
      `[...document.querySelectorAll('button,a,[role=button],[role=link]')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})?.click()`,
    )
  const started = Date.now()
  await cdp.send('Page.navigate', { url })
  let load
  while (load === undefined && Date.now() - started < 30_000) {
    if ((await ev('document.readyState')) === 'complete') load = Date.now() - started
    else await sleep(25)
  }
  let first
  while (first === undefined && Date.now() - started < 30_000) {
    if (await ev('!!document.querySelector("textarea, [contenteditable=true], .xterm")'))
      first = Date.now() - started
    else await sleep(25)
  }
  await sleep(1500)
  const cost = JSON.parse(
    await ev(
      `JSON.stringify({ requests: performance.getEntriesByType('resource').length, wireBytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.transferSize, 0), decodedBytes: performance.getEntriesByType('resource').reduce((n, r) => n + r.decodedBodySize, 0), jsHeapBytes: performance.memory ? performance.memory.usedJSHeapSize : null, title: document.title })`,
    ),
  )
  const result = { loadMs: load, firstRenderMs: first, ...cost }
  await click('Continue')
  await sleep(700)
  await click('Configure later')
  await sleep(700)
  await shot('frame')
  if (flags.includes('--settings')) {
    await click('Settings')
    await sleep(1500)
    await shot('settings')
    result.settings =
      (await ev(`document.body.innerText.replace(/\\n+/g, ' / ')`)).match(
        /General \/ Models.*?Close/u,
      )?.[0] ?? null
  }
  if (flags.includes('--terminal')) {
    await click('Close')
    await sleep(500)
    await ev(`document.querySelector('button[aria-label="New tab: Terminal"]')?.click()`)
    await sleep(3500)
    await ev(`document.querySelector('.xterm-helper-textarea')?.focus()`)
    await cdp.send('Input.insertText', { text: 'echo spike-pty-$((6*7))' })
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    })
    await sleep(1500)
    await shot('terminal')
    result.terminalAnswered =
      (
        (await ev(`document.querySelector('.xterm-rows')?.innerText ?? ''`)).match(
          /^spike-pty-42$/mu,
        ) ?? []
      ).length > 0
  }
  console.log(JSON.stringify(result))
  cdp.close()
} finally {
  chrome.kill('SIGKILL')
}
