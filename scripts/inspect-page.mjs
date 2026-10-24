#!/usr/bin/env node
/**
 * Drive and read an ACRYL Desktop window started with `scripts/live-run.mjs desktop --inspect <port>`, through Chromium's inspector protocol.
 *
 *   node scripts/inspect-page.mjs [--port 9222] health               the page health record (`window.__acrylHealth.incidents`)
 *   node scripts/inspect-page.mjs [--port 9222] tabs                 the selected worktree's tab strip and the chat on screen
 *   node scripts/inspect-page.mjs [--port 9222] eval '<expression>'  any expression, awaited, printed as JSON
 *   node scripts/inspect-page.mjs [--port 9222] click <x> <y>        a real mouse click at CSS pixels (a user gesture, unlike element.click())
 *   node scripts/inspect-page.mjs [--port 9222] press <key> [meta,shift,alt,ctrl]   a real key press, for example `press . meta,shift`
 *   node scripts/inspect-page.mjs [--port 9222] type <text>          type text into the focused element (click it first)
 *   node scripts/inspect-page.mjs [--port 9222] shot <file.png>      a screenshot
 *
 * Every command gives up after 15 s: a page that does not answer is itself the finding (a blocked renderer), and is reported as such.
 */
import { writeFileSync } from 'node:fs'
import { connectInspector } from './lib/inspector.mjs'

const args = process.argv.slice(2)
const portAt = args.indexOf('--port')
const port = portAt >= 0 ? Number(args.splice(portAt, 2)[1]) : 9222
const [command, ...rest] = args

const QUERIES = {
  health: '(window.__acrylHealth?.incidents ?? null)',
  tabs: `(() => {
    const tabs = [...document.querySelectorAll('.dshWorkspaceTab')].filter(tab => tab.offsetParent !== null)
    return {
      tabs: tabs.map(tab => ({ title: tab.textContent.replace(/[◎◫×]/gu, '').trim(), kind: tab.dataset.tileKind, chat: tab.dataset.chatSessionId, selected: tab.dataset.active === 'true' })),
      conversation: document.querySelector('[data-acryl-slot=conversation] [class*=itle]')?.textContent.trim().slice(0, 80) ?? null,
    }
  })()`,
}

const timer = setTimeout(() => { console.error(`inspect-page: no answer from the page within 15 s (port ${String(port)}): the renderer is blocked or gone`); process.exit(3) }, 15_000)
const page = await connectInspector(port)

if (command in QUERIES) console.log(JSON.stringify(await page.evaluate(QUERIES[command]), null, 1))
else if (command === 'eval') console.log(JSON.stringify(await page.evaluate(rest[0]), null, 1))
else if (command === 'click') {
  await page.click(Number(rest[0]), Number(rest[1]))
  console.log(`clicked ${rest[0]},${rest[1]}`)
} else if (command === 'press') {
  const [key, modifierList = ''] = rest
  await page.press(key, modifierList.split(',').filter(Boolean))
  console.log(`pressed ${modifierList === '' ? '' : `${modifierList}+`}${key}`)
} else if (command === 'type') {
  await page.type(rest[0])
  console.log(`typed ${JSON.stringify(rest[0])}`)
} else if (command === 'shot') {
  writeFileSync(rest[0], await page.screenshot())
  console.log(`saved ${rest[0]}`)
} else {
  console.error('usage: inspect-page.mjs [--port N] health | tabs | eval <expression> | click <x> <y> | press <key> [modifiers] | type <text> | shot <file.png>')
  process.exitCode = 2
}
clearTimeout(timer)
page.close()
