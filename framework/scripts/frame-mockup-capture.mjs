#!/usr/bin/env node
/**
 * The Blends frame's acceptance captures: the owner's mockup (docs/design/blends-frame-mockup.html) at 1440x900 for each scenario, and the real
 * frame at the same size, written side by side so a person compares each pair before a frame change lands.
 *
 *   node scripts/frame-mockup-capture.mjs mockup <outDir> [scenario...]
 *   node scripts/frame-mockup-capture.mjs frame <outDir> <url> [name]
 *
 * Mockup scenarios are the mock's own switcher keys (first, agent, claude, files, hist, plugins, preview, prod, prodfb, assist). Each one is captured
 * from a fresh load, since the mock keeps some state (the feedback hint) across switches. The mock's window is 1010x600 inside the page; the capture
 * makes it fill the viewport, so both sides of a pair have the same size.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { devtools, startChrome } from './lib/door-probe.mjs'

const WIDTH = 1440
const HEIGHT = 900
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MOCKUP = join(ROOT, 'docs', 'design', 'blends-frame-mockup.html')
export const SCENARIOS = [
  'first',
  'agent',
  'claude',
  'files',
  'hist',
  'plugins',
  'preview',
  'prod',
  'prodfb',
  'assist',
]

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function withPage(run) {
  const profile = mkdtempSync(join(tmpdir(), 'acryl-frame-capture-'))
  const chrome = await startChrome(profile, {
    args: [`--window-size=${String(WIDTH)},${String(HEIGHT)}`],
  })
  try {
    const page = await devtools(chrome.port)
    try {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: WIDTH,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await page.send('Page.enable')
      return await run(page)
    } finally {
      page.close()
    }
  } finally {
    await chrome.stop()
    rmSync(profile, { recursive: true, force: true })
  }
}

async function load(page, url, settleMs) {
  await page.send('Page.navigate', { url })
  const deadline = Date.now() + 30_000
  for (;;) {
    const state = await page.send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    })
    if (state.result?.result?.value === 'complete') break
    if (Date.now() > deadline) throw new Error(`${url} did not finish loading`)
    await sleep(100)
  }
  await sleep(settleMs)
}

async function evaluate(page, expression) {
  const reply = await page.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (reply.result?.exceptionDetails !== undefined)
    throw new Error(
      `page script failed: ${JSON.stringify(reply.result.exceptionDetails).slice(0, 400)}`,
    )
  return reply.result?.result?.value
}

async function shoot(page, file) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data === undefined) throw new Error(`no screenshot for ${file}`)
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
}

/** Make the mock's window the whole viewport and show one scenario. */
const MOCKUP_SETUP = (scenario) => `(() => {
  const button = document.querySelector('.scenarios button[data-s=${JSON.stringify(scenario)}]')
  if (button === null) throw new Error('no scenario ${scenario}')
  // A click that does not bubble: the mock closes Settings (scenario 6) on any click that reaches the document.
  button.dispatchEvent(new MouseEvent('click', { bubbles: false }))
  const style = document.createElement('style')
  style.textContent = '.win { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; min-width: 0 !important; border: 0 !important; border-radius: 0 !important; z-index: 2147483647 } .dots { display: none !important } body { overflow: hidden !important }'
  document.head.append(style)
  return true
})()`

async function captureMockup(outDir, scenarios) {
  mkdirSync(outDir, { recursive: true })
  for (const scenario of scenarios) {
    await withPage(async (page) => {
      await load(page, pathToFileURL(MOCKUP).href, 300)
      await evaluate(page, MOCKUP_SETUP(scenario))
      await sleep(400)
      const file = join(outDir, `mockup-${scenario}.png`)
      await shoot(page, file)
      console.log(file)
    })
  }
}

async function captureFrame(outDir, url, name) {
  mkdirSync(outDir, { recursive: true })
  await withPage(async (page) => {
    await load(page, url, 4000)
    const file = join(outDir, `frame-${name}.png`)
    await shoot(page, file)
    console.log(file)
  })
}

const [mode, outDir, ...rest] = process.argv.slice(2)
if (mode === 'mockup' && outDir !== undefined) {
  await captureMockup(resolve(outDir), rest.length > 0 ? rest : SCENARIOS)
} else if (mode === 'frame' && outDir !== undefined && rest[0] !== undefined) {
  await captureFrame(resolve(outDir), rest[0], rest[1] ?? 'first')
} else {
  console.error(
    'usage: frame-mockup-capture.mjs mockup <outDir> [scenario...] | frame <outDir> <url> [name]',
  )
  process.exit(2)
}
