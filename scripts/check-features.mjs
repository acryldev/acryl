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
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
  // One real file, for the editor checks (breadcrumbs, line comments).
  writeFileSync(join(project, 'README.md'), '# Check project\n\nA line to comment on.\n')
  for (const command of [['init', '-q', '-b', 'main'], ['add', 'README.md'], ['-c', 'user.name=check', '-c', 'user.email=check@localhost', 'commit', '-q', '-m', 'start']]) {
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
  const missing = ['Models', 'Agents', 'Tabs', 'Command palette', 'Shortcuts', 'Agent Control'].filter(name => !sections.includes(name))
  if (missing.length > 0) throw new Error(`missing: ${missing.join(', ')} (found: ${sections.join(', ')})`)
  return sections.join(', ')
})

await check('Settings > Shortcuts lists ACRYL\'s commands with their keys', async () => {
  await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.offsetParent && e.className.includes('dshWorkspaceSideFootButton') && e.textContent.trim() === 'Settings'); b?.click(); return true })()`)
  await sleep(1200)
  await page.evaluate(`[...document.querySelectorAll('[role=dialog] nav button')].find(e => e.textContent.trim() === 'Shortcuts')?.click()`)
  const rows = await until(`(() => { const rows = [...document.querySelectorAll('.acrylShortcutsRow')].map(r => r.querySelector('.acrylShortcutsName')?.textContent + ' ' + [...r.querySelectorAll('kbd')].map(k => k.textContent).join('')); return rows.length > 0 ? rows : false })()`)
  await page.press('Escape')
  // Every keyboard command ACRYL had before the DSH 0.2 move (spec 001 T076): the palette and the picker are ACRYL's, Open Settings is DSH's.
  const acryl = Array.isArray(rows) ? rows.filter(row => /Pick an element|command palette|settings/iu.test(row)) : []
  if (acryl.length !== 3) throw new Error(`a command from before the DSH 0.2 move is missing: ${JSON.stringify(acryl)} of ${JSON.stringify(rows).slice(0, 300)}`)
  return acryl.join('; ')
})

await check('Settings opens with Cmd/Ctrl+,', async () => {
  await sleep(500)
  await page.press(',', [primary])
  const open = await until(`!!document.querySelector('[role=dialog] nav')`)
  await page.press('Escape')
  expectTrue(open, 'no Settings after the shortcut')
  return 'opened'
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

// The test project's README: only in an isolated copy (--launch), which made it.
if (run !== undefined) {
  await check('a file has clickable breadcrumbs and a "+" to comment on a line', async () => {
    await page.press('p', [primary, 'shift'])
    expectTrue(await until(`!!document.querySelector('input[role=combobox]')`), 'no palette')
    await page.evaluate(`(() => { const i = document.querySelector('input[role=combobox]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'README.md'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    expectTrue(await until(`[...document.querySelectorAll('.dshPaletteList [role=option]')].some(o => o.textContent.includes('README.md'))`, 15_000), 'the palette did not find README.md')
    await page.press('Enter')
    const crumbs = await until(`(() => { const c = [...document.querySelectorAll('.dshWorkspaceCrumbsPath .dshWorkspaceCrumb')].map(b => b.textContent); return c.includes('README.md') ? c : false })()`, 15_000)
    expectTrue(Array.isArray(crumbs), 'no breadcrumbs above the file')
    await page.evaluate(`document.querySelector('.dshWorkspaceCrumbsPath .dshWorkspaceCrumb').click()`)
    const listed = await until(`(() => { const o = [...document.querySelectorAll('.dshWorkspaceCrumbsItem')].map(e => e.textContent); return o.length > 0 ? o : false })()`)
    await page.press('Escape')
    expectTrue(Array.isArray(listed) && listed.includes('README.md'), `the project's folder lists ${JSON.stringify(listed)}`)
    const plus = await page.evaluate(`(() => { const line = [...document.querySelectorAll('.cm-line')][2]; if (!line) return false; const r = line.getBoundingClientRect(); line.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + 10, clientY: r.y + r.height / 2 })); return true })()`)
    expectTrue(plus === true, 'no editor lines')
    expectTrue(await until(`[...document.querySelectorAll('.cm-acrylCommentPlus')].some(p => getComputedStyle(p.parentElement).visibility !== 'hidden')`), 'no "+" beside the pointed line')
    return `${crumbs.join(' > ')}; the folder lists ${listed.length} entries; "+" shown`
  })
}

// Continues in the README the check above opened.
if (run !== undefined) {
  await check('a comment is kept as a note with clipboard buttons, sent nowhere, and listed on the Comments page', async () => {
    const opened = await page.evaluate(`(() => { const plus = [...document.querySelectorAll('.cm-acrylCommentPlus')].find(p => getComputedStyle(p.parentElement).visibility !== 'hidden'); if (!plus) return false; plus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true })()`)
    expectTrue(opened === true, 'no "+" to press')
    expectTrue(await until(`!!document.querySelector('textarea.cm-acrylCommentInput')`), 'the "+" opened no comment form')
    await page.evaluate(`(() => { const i = document.querySelector('textarea.cm-acrylCommentInput'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(i, 'check-features comment'); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    expectTrue(await clickButton('Comment'), 'no Comment button')
    const note = await until(`(() => { const n = document.querySelector('.cm-acrylCommentNote'); if (!n) return false; return [...n.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.textContent.trim()) })()`)
    expectTrue(Array.isArray(note) && note.includes('Comment to clipboard') && note.includes('All comments to clipboard') && note.includes('Close this comment'), `the note has ${JSON.stringify(note)}`)
    const noteText = await page.evaluate(`document.querySelector('.cm-acrylCommentNote').textContent`)
    expectTrue(!/Sent to/u.test(noteText), `the note says it was sent: ${noteText}`)
    // The Start page lists Comments after Checks; open the right panel if it is closed, then the Comments tab.
    await page.evaluate(`document.querySelector('button[aria-label="Show right panel"]')?.click()`)
    await sleep(800)
    // The right panel may show another of its tabs; the Start tab holds the entries.
    await page.evaluate(`(() => { const tab = [...document.querySelectorAll('[role=tab], button, div')].find(e => e.offsetParent !== null && e.children.length <= 3 && e.textContent.trim() === 'Start'); tab?.click(); return tab !== undefined })()`)
    const entries = await until(`(() => { const names = [...document.querySelectorAll('button, [role=button]')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim()); return names.includes('Comments') ? names : false })()`)
    if (!Array.isArray(entries)) {
      const panel = await page.evaluate(`[...document.querySelectorAll('[role=tab], button')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().left > window.innerWidth / 2).map(e => e.textContent.trim() || e.getAttribute('aria-label')).slice(0, 30)`)
      throw new Error(`no Comments entry in the right panel; its controls: ${JSON.stringify(panel)}`)
    }
    await page.evaluate(`[...document.querySelectorAll('button, [role=button]')].find(e => e.offsetParent !== null && e.textContent.trim() === 'Comments').click()`)
    const listed = await until(`(() => { const page = document.querySelector('.dshWorkspaceComments'); return page && page.textContent.includes('check-features comment') ? page.textContent : false })()`)
    expectTrue(typeof listed === 'string', 'the Comments page does not list the comment')
    const sendMenu = await page.evaluate(`(() => { const b = [...document.querySelectorAll('.dshWorkspaceComments button')].find(e => e.textContent.trim() === 'Send to ▾'); if (!b) return false; b.click(); return true })()`)
    expectTrue(sendMenu === true, 'no Send to button on the Comments page')
    const menu = await until(`(() => { const m = document.querySelector('.dshWorkspaceSendMenuList'); return m ? m.textContent : false })()`)
    await page.press('Escape')
    // Closing it from the page closes the note in the editor too.
    await page.evaluate(`document.querySelector('.dshWorkspaceComments button[aria-label^="Close the comment"]').click()`)
    expectTrue(await until(`!document.querySelector('.cm-acrylCommentNote')`), 'closing on the Comments page left the note in the editor')
    return `note buttons ${note.join(', ')}; Comments page listed it; Send to offers: ${menu}`
  })
}

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
