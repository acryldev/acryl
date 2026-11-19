import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GitRunner, Versions } from 'acryl-versions'
import { Acryl } from 'acrylblends'
import { AutoSave, messageText, requestSubject, SaveStore, type AutoSaveDeps } from '../src/auto-save.ts'
import { frameRoutes, saveVersion } from '../src/index.ts'
import { parseChatSaves, type TurnSaveView } from '../src/contract.ts'
import { ChatSavesStore, saveLine, type ChatSavesApi } from '../src/client/chat-saves.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function temp(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'acryl-auto-save-')))
  cleanups.push(() => { rmSync(dir, { recursive: true, force: true }) })
  return dir
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } }).trim()
}

function repository(): string {
  const dir = temp()
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Test Person')
  git(dir, 'config', 'user.email', 'test@example.com')
  writeFileSync(join(dir, 'a.txt'), 'one')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'First version')
  return dir
}

describe('a version called after the request', () => {
  it('takes the first sentence or clause, in one line', () => {
    expect(requestSubject('add a due date to each task, and show "due today" in orange.')).toBe('Add a due date to each task')
    expect(requestSubject('Fix the invite link!  It is wrong.')).toBe('Fix the invite link')
    expect(requestSubject('\n\n  make the board work on phones\nthen test it')).toBe('Make the board work on phones')
  })

  it('cuts a long request at a word and says so', () => {
    const subject = requestSubject('Rewrite the whole onboarding flow so that every new teammate lands on a checklist of their first tasks')
    expect(subject.endsWith('…')).toBe(true)
    expect(subject.length).toBeLessThanOrEqual(51)
    expect(subject).not.toMatch(/ …$/u)
  })

  it('has a name for a request that says nothing', () => {
    expect(requestSubject(undefined)).toBe('Changes from the chat')
    expect(requestSubject('   \n ')).toBe('Changes from the chat')
  })

  it('reads the text blocks of a user message and nothing else', () => {
    expect(messageText({ content: [{ type: 'text', text: 'hello' }, { type: 'image' }, { type: 'text', text: 'there' }] })).toBe('hello\nthere')
    expect(messageText(null)).toBe('')
    expect(messageText({ content: 'plain' })).toBe('')
  })
})

describe('the saves a chat keeps', () => {
  const save = (turn: number, files: string[]): TurnSaveView => ({ turn, files, hash: `h${String(turn)}`, version: turn + 1, subject: `Turn ${String(turn)}` })

  it('remembers a turn across a restart, in turn order', async () => {
    const file = join(temp(), 'home', 'chat-saves.json')
    const first = new SaveStore(file)
    await first.put('s1', save(2, ['b.ts']))
    await first.put('s1', save(1, ['a.ts']))
    await first.put('s2', save(1, ['c.ts']))
    const again = new SaveStore(file)
    expect((await again.forSession('s1')).map(entry => entry.turn)).toEqual([1, 2])
    expect(await again.forSession('s3')).toEqual([])
  })

  it('keeps every file of a turn that was saved twice, and the newer version', async () => {
    const store = new SaveStore(join(temp(), 'saves.json'))
    await store.put('s1', save(1, ['a.ts']))
    await store.put('s1', { ...save(1, ['b.ts']), hash: 'newer', version: 9 })
    expect(await store.forSession('s1')).toEqual([{ turn: 1, files: ['a.ts', 'b.ts'], hash: 'newer', version: 9, subject: 'Turn 1' }])
  })

  it('starts again from a file it cannot read, and tells the host', async () => {
    const dir = temp()
    const file = join(dir, 'saves.json')
    writeFileSync(file, '{not json')
    const reported: unknown[] = []
    const store = new SaveStore(file, cause => reported.push(cause))
    expect(await store.forSession('s1')).toEqual([])
    expect(reported).toHaveLength(1)
    await store.put('s1', save(1, ['a.ts']))
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveProperty('s1')
  })
})

describe('the auto-save', () => {
  function harness(files: Record<number, string[]>, saved = true) {
    const store = new SaveStore(join(temp(), 'saves.json'))
    const messages: string[] = []
    const deps: AutoSaveDeps = {
      summary: (_session, seq) => (files[seq] === undefined ? undefined : { files: files[seq].map(display => ({ display })) }),
      save: (message) => {
        messages.push(message)
        return Promise.resolve(saved ? { hash: `hash${String(messages.length)}`, version: 6 + messages.length, subject: message } : undefined)
      },
      store,
      report: (cause) => { throw cause instanceof Error ? cause : new Error(String(cause)) },
    }
    return { auto: new AutoSave(deps), store, messages }
  }
  const turn = (auto: AutoSave, session: string, number: number, request: string, changesSeq: number): void => {
    auto.observe(session, { type: 'turn/start', seq: changesSeq - 3, data: { turn: number } })
    auto.observe(session, { type: 'user/message', seq: changesSeq - 2, data: { content: [{ type: 'text', text: request }] } })
    auto.observe(session, { type: 'turn/end', seq: changesSeq - 1, data: { turn: number } })
    auto.observe(session, { type: 'workspace/changes', seq: changesSeq, data: { turn: number } })
  }

  it('saves a turn that changed files under the person\'s request and remembers which turn it was', async () => {
    const { auto, store, messages } = harness({ 10: ['src/routes.ts', 'src/board.ts'] })
    turn(auto, 's1', 3, 'Add due dates, and show today in orange', 10)
    await auto.settled()
    expect(messages).toEqual(['Add due dates'])
    expect(await store.forSession('s1')).toEqual([{ turn: 3, files: ['src/routes.ts', 'src/board.ts'], hash: 'hash1', version: 7, subject: 'Add due dates' }])
  })

  it('saves a turn the person stopped: DSH announces its changes while stopping, before the turn ends', async () => {
    const { auto, store, messages } = harness({ 10: ['src/hang-note.ts'] })
    auto.observe('s1', { type: 'turn/start', seq: 7, data: { turn: 4 } })
    auto.observe('s1', { type: 'user/message', seq: 8, data: { content: [{ type: 'text', text: 'Write the note, then run the tests.' }] } })
    auto.observe('s1', { type: 'workspace/changes', seq: 10, data: { turn: 4 } })
    auto.observe('s1', { type: 'turn/end', seq: 11, data: { turn: 4 } })
    await auto.settled()
    expect(messages).toEqual(['Write the note'])
    expect(await store.forSession('s1')).toEqual([{ turn: 4, files: ['src/hang-note.ts'], hash: 'hash1', version: 7, subject: 'Write the note' }])
  })

  it('makes no version for a turn that changed nothing', async () => {
    const { auto, store, messages } = harness({ 10: [] })
    turn(auto, 's1', 1, 'What is in the app?', 10)
    await auto.settled()
    expect(messages).toEqual([])
    expect(await store.forSession('s1')).toEqual([])
  })

  it('records nothing when the folder had nothing to commit', async () => {
    const { auto, store } = harness({ 10: ['a.ts'] }, false)
    turn(auto, 's1', 1, 'Edit a', 10)
    await auto.settled()
    expect(await store.forSession('s1')).toEqual([])
  })

  it('keeps two chats apart and saves them one after the other', async () => {
    const { auto, store, messages } = harness({ 10: ['a.ts'], 20: ['b.ts'] })
    turn(auto, 's1', 1, 'First chat', 10)
    turn(auto, 's2', 1, 'Second chat', 20)
    await auto.settled()
    expect(messages).toEqual(['First chat', 'Second chat'])
    expect((await store.forSession('s1'))[0]?.files).toEqual(['a.ts'])
    expect((await store.forSession('s2'))[0]?.files).toEqual(['b.ts'])
  })

  it('names a later turn after its own request, not the first one', async () => {
    const { auto, messages } = harness({ 10: ['a.ts'], 20: ['a.ts'] })
    turn(auto, 's1', 1, 'First request', 10)
    turn(auto, 's1', 2, 'Second request', 20)
    await auto.settled()
    expect(messages).toEqual(['First request', 'Second request'])
  })
})

describe('saving the folder as a version', () => {
  it('commits what changed, numbers it from the first version, and makes none when nothing changed', async () => {
    const dir = repository()
    const runner = new GitRunner()
    cleanups.push(() => { void runner.dispose() })
    const versions = new Versions(runner)
    expect(await saveVersion(runner, versions, dir, 'Nothing yet')).toBeUndefined()
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src', 'routes.ts'), 'export {}')
    const saved = await saveVersion(runner, versions, dir, 'Add routes')
    expect(saved).toMatchObject({ version: 2, subject: 'Add routes' })
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('Add routes')
    expect(git(dir, 'status', '--porcelain')).toBe('')
    expect(await saveVersion(runner, versions, dir, 'Again')).toBeUndefined()
  })
})

describe('the chat-saves route', () => {
  const call = (app: Acryl, path: string) => app.fetch(new Request(`http://127.0.0.1:43120${path}`, {
    headers: { host: '127.0.0.1:43120', origin: 'http://127.0.0.1:43120', 'sec-fetch-site': 'same-origin' },
  }), { connection: { remoteAddress: '127.0.0.1', localPort: 43120 } })
  const state = () => Promise.reject(new Error('not asked'))
  const port = { read: (session: string) => Promise.resolve({ saves: session === 'abc' ? [{ turn: 1, files: ['a.ts'], hash: 'h', version: 2, subject: 'S' }] : [] }) }

  it('answers a chat\'s saves to the app\'s own page', async () => {
    const response = await call(frameRoutes({ state, chatSaves: port }), '/api/acryl-blends-frame/chat-saves?session=abc')
    expect(response.status).toBe(200)
    expect(parseChatSaves(await response.json()).saves).toHaveLength(1)
  })

  it('refuses a session that is not an id', async () => {
    const app = frameRoutes({ state, chatSaves: port })
    expect((await call(app, '/api/acryl-blends-frame/chat-saves')).status).toBe(400)
    expect((await call(app, '/api/acryl-blends-frame/chat-saves?session=../../etc')).status).toBe(400)
  })
})

describe('the line under an answer', () => {
  it('names the files and the version, and counts the files it leaves out', () => {
    expect(saveLine({ files: ['src/routes.ts', 'src/board.ts'], version: 7 })).toBe('edited src/routes.ts, src/board.ts · saved as v7')
    expect(saveLine({ files: ['a', 'b', 'c', 'd', 'e'], version: 2 })).toBe('edited a, b, c and 2 more · saved as v2')
  })

  it('tells the frame about a new save once, and shares overlapping reads', async () => {
    const saves: TurnSaveView[] = []
    let reads = 0
    const api: ChatSavesApi = { read: () => { reads += 1; return Promise.resolve([...saves]) } }
    let told = 0
    const store = new ChatSavesStore(api, () => { told += 1 })
    await Promise.all([store.refresh('s1'), store.refresh('s1')])
    expect(reads).toBe(1)
    expect(told).toBe(0)
    saves.push({ turn: 1, files: ['a.ts'], hash: 'h', version: 2, subject: 'S' })
    await store.refresh('s1')
    await store.refresh('s1')
    expect(told).toBe(1)
    expect(store.getSnapshot('s1')).toHaveLength(1)
    expect(store.getSnapshot('other')).toEqual([])
  })

  it('keeps what it showed when a read fails', async () => {
    let fail = false
    const api: ChatSavesApi = { read: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve([{ turn: 1, files: ['a.ts'], hash: 'h', version: 2, subject: 'S' }])) }
    const store = new ChatSavesStore(api)
    await store.refresh('s1')
    fail = true
    await store.refresh('s1')
    expect(store.getSnapshot('s1')).toHaveLength(1)
  })
})
