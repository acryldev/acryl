import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { AppInstance } from '../../instance/index.ts'
import { openProductStorage } from '../../instance/storage.ts'
import { type AppPagePorts, appPageHandler, exportFileName } from '../app-page.ts'

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, {
    cwd,
    env: {
      PATH: process.env.PATH,
      HOME: cwd,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'A',
      GIT_AUTHOR_EMAIL: 'a@example.invalid',
      GIT_COMMITTER_NAME: 'A',
      GIT_COMMITTER_EMAIL: 'a@example.invalid',
    },
  })
}

const seed = (source: string): void => {
  writeFileSync(join(source, 'app.ts'), 'export {}\n')
  git(source, 'init', '-q', '-b', 'main')
  git(source, 'add', '-A')
  git(source, 'commit', '-q', '-m', 'first')
}

/** A product with its first app (named by the product, as the first start makes it) and the page's ports around it, the shell's dialogs scripted. */
function page(overrides: Partial<AppPagePorts> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'acryl-app-page-'))
  const storage = openProductStorage({
    writtenBy: '1.0.0',
    env: { HOME: home },
    home,
  })
  let current = storage.create('Blank', seed).id
  const calls: string[] = []
  const answers = {
    exportFile: undefined as string | undefined,
    importFile: undefined as string | undefined,
  }
  const handle = appPageHandler({
    storage,
    current: () => current,
    seed,
    switchTo: async (next: () => AppInstance) => {
      calls.push('stop the host')
      current = next().id
      calls.push(`start the host on ${current}`)
    },
    chooseExportFile: async (suggested) => {
      calls.push(`save dialog: ${suggested}`)
      return answers.exportFile
    },
    chooseImportFile: async () => answers.importFile,
    openPath: async (path) => {
      calls.push(`open ${path}`)
    },
    renamed: (app) => {
      calls.push(`renamed ${app.name}`)
    },
    platform: 'darwin',
    ...overrides,
  })
  return { home, storage, handle, calls, answers, current: () => current }
}

test('the first start: the app is not named yet, so the page asks; naming it is the person’s name from then on', async () => {
  const { handle, calls, current } = page()
  assert.deepEqual(await handle('state', undefined), {
    ok: true,
    value: {
      id: current(),
      name: 'Blank',
      named: false,
      others: [],
      fileManager: 'Finder',
      git: false,
    },
  })
  const renamed = await handle('rename', '  Shop  ')
  assert.equal(renamed.ok && (renamed.value as { name: string; named: boolean }).name, 'Shop')
  assert.equal(renamed.ok && (renamed.value as { named: boolean }).named, true)
  assert.deepEqual(calls, ['renamed Shop'])
  assert.deepEqual(await handle('rename', ''), {
    ok: false,
    message: 'an app name is one line of 1 to 80 characters',
  })
})

test('export asks where, suggests the app’s name, and writes nothing when the person cancels', async () => {
  const { handle, calls, answers, home } = page()
  await handle('rename', 'My: notes.')
  assert.deepEqual(await handle('export', { data: true }), { ok: true, value: { cancelled: true } })
  assert.ok(calls.includes('save dialog: My- notes.acrylblend'), calls.join(' | '))
  answers.exportFile = join(home, 'out.acrylblend')
  assert.deepEqual(await handle('export', { data: false }), {
    ok: true,
    value: { file: answers.exportFile },
  })
  assert.ok(existsSync(answers.exportFile))
})

test('import makes a new app beside the running one, then switches to it; the old app is one of the others', async () => {
  const { handle, answers, home, storage, current, calls } = page()
  const first = current()
  answers.exportFile = join(home, 'Copy of blank.acrylblend')
  await handle('export', { data: false })
  assert.deepEqual(await handle('import', undefined), { ok: true, value: { cancelled: true } })
  answers.importFile = answers.exportFile
  assert.deepEqual(await handle('import', undefined), { ok: true, value: undefined })
  assert.notEqual(current(), first)
  assert.equal(storage.app(current()).name, 'Copy of blank')
  assert.ok(calls.includes('stop the host'))
  const state = await handle('state', undefined)
  assert.deepEqual(state.ok && (state.value as { others: unknown }).others, [
    { id: first, name: 'Blank', created: storage.app(first).created },
  ])
  // Back to the first one.
  assert.deepEqual(await handle('open', first), { ok: true, value: undefined })
  assert.equal(current(), first)
  assert.deepEqual(await handle('open', 'nope-0000'), {
    ok: false,
    message: 'there is no such app on this computer',
  })
})

test('start over runs with the host stopped and lands on a fresh app of the same name', async () => {
  const { handle, storage, current, calls } = page()
  const first = current()
  await handle('rename', 'Shop')
  calls.length = 0
  assert.deepEqual(await handle('startOver', undefined), { ok: true, value: undefined })
  assert.notEqual(current(), first)
  assert.equal(storage.app(current()).name, 'Shop')
  assert.deepEqual(calls, ['stop the host', `start the host on ${current()}`])
  assert.deepEqual(
    storage.apps().map((app) => app.id),
    [current()],
  )
})

test('git’s licence and source open only when the product ships git; an unknown request is refused', async () => {
  const without = page()
  assert.deepEqual(await without.handle('gitLicence', undefined), {
    ok: false,
    message: 'this app ships no git of its own',
  })
  const withGit = page({
    git: {
      executable: '/R/git/bin/git',
      bin: '/R/git/bin',
      licence: '/R/git/COPYING.txt',
      source: '/R/git/SOURCE.txt',
    },
  })
  await withGit.handle('gitLicence', undefined)
  await withGit.handle('gitSource', undefined)
  assert.deepEqual(withGit.calls, ['open /R/git/COPYING.txt', 'open /R/git/SOURCE.txt'])
  const state = await withGit.handle('state', undefined)
  assert.equal(state.ok && (state.value as { git: boolean }).git, true)
  assert.deepEqual(await withGit.handle('rm -rf', '/'), {
    ok: false,
    message: 'the app page cannot rm -rf',
  })
})

test('the export’s suggested file name is one every OS accepts', () => {
  assert.equal(exportFileName('Shop'), 'Shop.acrylblend')
  assert.equal(exportFileName('a/b\\c:d*e?'), 'a-b-c-d-e-.acrylblend')
  assert.equal(exportFileName('Notes. '), 'Notes.acrylblend')
  assert.equal(exportFileName('\u0001'), 'app.acrylblend')
  assert.equal(exportFileName('Zoë’s café'), 'Zoë’s café.acrylblend')
})
