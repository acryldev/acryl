#!/usr/bin/env node
/**
 * Drive and read an ACRYL Desktop window started with `scripts/live-run.mjs desktop --inspect <port>`, through Chromium's inspector protocol.
 *
 *   node scripts/inspect-page.mjs [--port 9222] health               the page health record (`window.__acrylHealth.incidents`)
 *   node scripts/inspect-page.mjs [--port 9222] tabs                 the selected worktree's tab strip and the chat on screen
 *   node scripts/inspect-page.mjs [--port 9222] eval '<expression>'  any expression, awaited, printed as JSON
 *   node scripts/inspect-page.mjs [--port 9222] click <x> <y>        a real mouse click at CSS pixels (a user gesture, unlike element.click())
 *   node scripts/inspect-page.mjs [--port 9222] shot <file.png>      a screenshot
 *   node scripts/inspect-page.mjs [--port 9222] press <key> [meta,shift,alt,ctrl]   a real key press, for example `press . meta,shift`
 *
 * Every command gives up after 15 s: a page that does not answer is itself the finding (a blocked renderer), and is reported as such.
 */
import { writeFileSync } from 'node:fs'

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
const targets = await (await fetch(`http://127.0.0.1:${String(port)}/json`)).json()
const page = targets.find(target => target.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\//u.test(target.url))
if (page === undefined) { console.error(`inspect-page: no ACRYL page on inspector port ${String(port)}`); process.exit(2) }
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let nextId = 0
const waiting = new Map()
socket.onmessage = (message) => { const data = JSON.parse(message.data); if (data.id !== undefined) { waiting.get(data.id)?.(data); waiting.delete(data.id) } }
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; waiting.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (reply.result?.exceptionDetails !== undefined) throw new Error(reply.result.exceptionDetails.exception?.description ?? reply.result.exceptionDetails.text)
  return reply.result?.result?.value
}

if (command in QUERIES) console.log(JSON.stringify(await evaluate(QUERIES[command]), null, 1))
else if (command === 'eval') console.log(JSON.stringify(await evaluate(rest[0]), null, 1))
else if (command === 'click') {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: Number(rest[0]), y: Number(rest[1]), button: 'left', clickCount: 1 })
  console.log(`clicked ${rest[0]},${rest[1]}`)
} else if (command === 'press') {
  const [key, modifierList = ''] = rest
  const bits = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
  const modifiers = modifierList.split(',').filter(Boolean).reduce((sum, name) => sum + (bits[name] ?? 0), 0)
  const code = key.length === 1 ? (/[a-z]/iu.test(key) ? `Key${key.toUpperCase()}` : key === '.' ? 'Period' : key === ',' ? 'Comma' : key === '/' ? 'Slash' : '') : key
  const keyCode = key.length === 1 ? (key === '.' ? 190 : key === ',' ? 188 : key === '/' ? 191 : key.toUpperCase().charCodeAt(0)) : 0
  for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, modifiers, windowsVirtualKeyCode: keyCode })
  console.log(`pressed ${modifierList === '' ? '' : `${modifierList}+`}${key}`)
} else if (command === 'shot') {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(rest[0], Buffer.from(shot.result.data, 'base64'))
  console.log(`saved ${rest[0]}`)
} else {
  console.error('usage: inspect-page.mjs [--port N] health | tabs | eval <expression> | click <x> <y> | press <key> [modifiers] | shot <file.png>')
  process.exitCode = 2
}
clearTimeout(timer)
socket.close()
