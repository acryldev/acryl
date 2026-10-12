#!/usr/bin/env node
/**
 * Use the features a person uses, in a real window, and say which ones work. Run it after every DSH upgrade: the 0.1.5 to 0.2 move kept
 * every name and changed meanings under them (an approval policy, a locale registry, an id format, shortcut focus regions), so the code
 * typechecked and the unit tests passed while features stopped working (spec 001 R43).
 *
 *   node scripts/check-features.mjs --port 9222                      check a page already open on that inspector port
 *   node scripts/check-features.mjs --launch [--copy-home ~/.acryl-dev]  start an isolated Desktop (live-run, no model key), check it, stop it
 *
 * Exit code 0 when every check passes, 1 otherwise. Each check prints PASS or FAIL with what it saw.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectInspector } from './lib/inspector.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback }
const port = Number(option('port', '9222'))
const primary = process.platform === 'darwin' ? 'meta' : 'ctrl'
const sleep = ms => new Promise(done => { setTimeout(done, ms) })
/** A throwaway git repository the launched app gets as its project (a fresh home has none; its first chat runs in a plain folder). */
let project

let run
if (args.includes('--launch')) {
  const copyHome = option('copy-home', undefined)
  run = spawn(process.execPath, [join(root, 'scripts/live-run.mjs'), 'desktop', '--no-key', '--inspect', String(port), ...(copyHome === undefined ? [] : ['--copy-home', copyHome])], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] })
  for (let waited = 0; ; waited += 3000) {
    const ready = await fetch(`http://127.0.0.1:${String(port)}/json`).then(response => response.json()).then(targets => targets.some(target => /^http:\/\/127\.0\.0\.1:\d+\//u.test(target.url))).catch(() => false)
    if (ready) break
    if (waited > 240_000) { run.kill('SIGTERM'); throw new Error('check-features: the window did not open within 4 minutes') }
    await sleep(3000)
  }
  await sleep(10_000)
}

const page = await connectInspector(port)
const results = []
const check = async (name, body) => {
  try {
    const detail = await body()
    results.push({ name, ok: true, detail })
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
  }
}
const expectTrue = (value, message) => { if (value !== true) throw new Error(message) }
/** Poll a page expression until it is truthy (a loaded machine answers late, so a fixed wait flakes); @returns its last value. */
const until = async (expression, timeoutMs = 8000) => {
  let value
  for (let waited = 0; waited <= timeoutMs; waited += 250) {
    value = await page.evaluate(expression)
    if (value) return value
    await sleep(250)
  }
  return value
}
const clickButton = text => page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && e.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true })()`)

/** A run without a model key opens DSH's "Add an API key" dialog at some moment after load; it is modal and takes the shortcuts, so close it as a person would. */
const closeKeyDialog = () => until(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent !== null && e.textContent.trim() === 'Configure later'); b?.click(); return b !== undefined })()`, 10_000)

if (run !== undefined) {
  await closeKeyDialog()
  project = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-check-project-')))
  for (const command of [['init', '-q', '-b', 'main'], ['-c', 'user.name=check', '-c', 'user.email=check@localhost', 'commit', '-q', '--allow-empty', '-m', 'start']]) {
    const result = spawnSync('git', command, { cwd: project, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`check-features: git ${command.join(' ')} failed: ${result.stderr}`)
  }
  // Registered through the app's own route, then the page reloads to read it; selecting its worktree opens a chat there.
  const added = await page.evaluate(`fetch('/api/acryl-workspace/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'add', path: ${JSON.stringify(project)} }) }).then(r => r.ok)`)
  if (added !== true) throw new Error('check-features: the app did not take the test project')
  await page.evaluate('setTimeout(() => { location.reload() }, 0)')
  await sleep(3000)
  const row = await until(`(() => { const b = document.querySelector('button.dshWorkspaceWorktree'); b?.click(); return b !== null })()`, 30_000)
  if (row !== true) throw new Error('check-features: the test project has no worktree in the tree')
  await until(`!!document.querySelector('button.dshWorkspaceWorktree[aria-pressed=true]')`, 15_000)
  await closeKeyDialog()
}

await page.evaluate(`(() => { window.__checkErrors = []; const original = console.error; console.error = (...a) => { window.__checkErrors.push(a.map(x => x instanceof Error ? x.message : String(x)).join(' ').slice(0, 300)); return original.apply(console, a) }; return true })()`)

await check('the workspace renders', async () => {
  expectTrue(await page.evaluate(`!!document.querySelector('.dshWorkspace')`), 'no workspace canvas')
  return `${String(await page.evaluate(`document.querySelectorAll('.dshWorkspaceTab').length`))} tabs`
})

await check('Settings lists ACRYL\'s sections', async () => {
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent && e.className.includes('dshWorkspaceSideFootButton') && e.textContent.trim() === 'Settings'); b?.click(); return true })()`)
  await sleep(1500)
  const sections = await page.evaluate(`[...document.querySelectorAll('[role=dialog] [role=tab], [role=dialog] nav button')].filter(e => e.offsetParent).map(e => e.textContent.trim())`)
  await page.press('Escape')
  const missing = ['Models', 'Agents', 'Tabs', 'Command palette', 'Agent Control'].filter(name => !sections.includes(name))
  if (missing.length > 0) throw new Error(`missing: ${missing.join(', ')} (found: ${sections.join(', ')})`)
  return sections.join(', ')
})

await check('the command palette opens (Cmd/Ctrl+Shift+P)', async () => {
  await sleep(500)
  await page.press('p', [primary, 'shift'])
  expectTrue(await until(`!!document.querySelector('.dshPaletteList')`), 'no palette after the shortcut')
  await page.press('Escape')
  return 'opened'
})

await check('the element inspector toggles from the chat composer (Cmd/Ctrl+Shift+.)', async () => {
  expectTrue(await page.evaluate(`(() => { const editor = [...document.querySelectorAll('[contenteditable=true]')].find(e => e.offsetParent); editor?.focus(); return editor !== undefined })()`), 'no composer to focus')
  await page.press('.', [primary, 'shift'])
  const on = await until(`!!document.querySelector('[data-acryl-mount-anchor-veil]')`)
  await page.press('Escape')
  expectTrue(on, 'the inspector did not turn on')
  return 'on, then off with Escape'
})

await check('every built-in tab type opens', async () => {
  const opened = []
  for (const item of ['New Terminal', 'New Browser Tab', 'New File', 'New Diff', 'New Board', 'New Doc']) {
    expectTrue(await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent && e.getAttribute('aria-label') === 'Choose what to open'); if (!b) return false; b.click(); return true })()`), 'no "+" menu')
    await sleep(600)
    expectTrue(await page.evaluate(`(() => { const m = [...document.querySelectorAll('[role=menuitem]')].find(e => e.offsetParent && e.textContent.trim() === ${JSON.stringify(item)}); if (!m) return false; m.click(); return true })()`), `no "${item}" in the menu`)
    await sleep(1500)
    opened.push(await page.evaluate(`document.querySelector('.dshWorkspaceTab[data-active=true]')?.dataset.tileKind ?? 'none'`))
  }
  return opened.join(', ')
})

await check('Board cards name their chats', async () => {
  expectTrue(await page.evaluate(`(() => { const tab = [...document.querySelectorAll('.dshWorkspaceTab')].find(e => e.dataset.tileKind === 'kanban'); tab?.querySelector('[role=tab]')?.click(); return tab !== undefined })()`), 'no Board tab')
  await sleep(1200)
  const text = await page.evaluate(`[...document.querySelectorAll('.dshWorkspaceKanbanSessionCard')].map(card => card.textContent).join(' | ')`)
  if (/\bsession-(\s|-|$)/u.test(text)) throw new Error(`a card shows an id prefix: ${text.slice(0, 160)}`)
  return text === '' ? 'no chats on the board' : text.slice(0, 120)
})

await check('a worktree pick returns from the Plugins page to the tabs', async () => {
  expectTrue(await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent && e.textContent.trim() === 'Plugins' && e.getBoundingClientRect().x < 400); if (!b) return false; b.click(); return true })()`), 'no Plugins entry')
  await sleep(1500)
  expectTrue(await page.evaluate(`!document.querySelector('.dshWorkspaceTab')`), 'the Plugins page did not open')
  expectTrue(await page.evaluate(`(() => { const row = document.querySelector('button.dshWorkspaceWorktree[aria-pressed=true]'); if (!row) return false; row.click(); return true })()`), 'no selected worktree to pick')
  await sleep(1500)
  expectTrue(await page.evaluate(`!!document.querySelector('.dshWorkspaceTab')`), 'the tabs did not come back')
  return 'back to the tabs'
})

// Creates a workspace: only in an isolated copy (--launch), never in a window someone is using.
if (run !== undefined) {
  await check('a new workspace is created from the dialog, shown with its own tabs, and switched back from (spec 043)', async () => {
    // The tabs other than chats, by kind: each workspace has its own set (T006).
    const otherTabs = `[...document.querySelectorAll('.dshWorkspaceTab')].map(e => e.dataset.tileKind).filter(kind => kind !== 'chat').join(',')`
    const defaultTabs = await page.evaluate(otherTabs)
    expectTrue(await page.evaluate(`(() => { const b = document.querySelector('[aria-label="New workspace"]'); b?.click(); return b !== null })()`), 'no New workspace button')
    await sleep(800)
    expectTrue(await page.evaluate(`(() => { const d = document.querySelector('[role=dialog][aria-label="New Workspace"]'); if (!d) return false; [...d.querySelectorAll('[role=radio]')].find(r => /Shared Context/.test(r.textContent))?.click(); const input = d.querySelector('[aria-label="Workspace name"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Feature check'); input.dispatchEvent(new Event('input', { bubbles: true })); return true })()`), 'no New Workspace dialog')
    await sleep(300)
    await page.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Create')?.click()`)
    await sleep(2000)
    expectTrue(await page.evaluate(`document.querySelector('[aria-label="Workspace Feature check"]')?.getAttribute('aria-pressed') === 'true'`), 'the new workspace is not the shown one')
    expectTrue(await page.evaluate(`!!document.querySelector('.dshWorkspaceSideEmpty')`), 'the new workspace does not show an empty project list')
    const newTabs = await page.evaluate(otherTabs)
    expectTrue(newTabs === '', `the new workspace shows another workspace's tabs: ${newTabs}`)
    await page.evaluate(`document.querySelector('[aria-label="Workspace Default"]')?.click()`)
    await sleep(2000)
    expectTrue(await page.evaluate(`document.querySelector('[aria-label="Workspace Default"]')?.getAttribute('aria-pressed') === 'true'`), 'Default did not come back')
    const backTabs = await page.evaluate(otherTabs)
    expectTrue(backTabs === defaultTabs, `Default's tabs changed: ${defaultTabs} before, ${backTabs} after`)
    return `created, shown empty with no tabs of its own, back to Default with its tabs (${defaultTabs})`
  })
}

await check('no errors and no freezes', async () => {
  const errors = await page.evaluate('window.__checkErrors')
  const incidents = await page.evaluate(`(window.__acrylHealth?.incidents ?? []).filter(incident => incident.kind !== 'long-task')`)
  if (errors.length > 0 || incidents.length > 0) throw new Error(`${String(errors.length)} console errors (${errors.slice(0, 2).join(' / ')}), ${String(incidents.length)} health incidents`)
  return 'none'
})

page.close()
for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}: ${result.detail}`)
const failed = results.filter(result => !result.ok).length
console.log(failed === 0 ? `check-features: all ${String(results.length)} checks passed` : `check-features: ${String(failed)} of ${String(results.length)} checks failed`)
if (run !== undefined) {
  run.kill('SIGTERM')
  await new Promise(done => { run.on('exit', done) })
}
if (project !== undefined) rmSync(project, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
