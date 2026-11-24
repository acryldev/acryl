import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  captureConsole,
  createStartupLog,
  isLockedFileError,
  retryLocked,
  updateFailureText,
  updateWindowUrl,
} from '../startup.ts'

const dirs: string[] = []
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-startup-'))
  dirs.push(dir)
  return dir
}
after(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('the start log keeps what was said before its folder was known, then every line, one file a day', () => {
  const dir = scratch()
  const at = new Date('2026-11-24T10:00:00.000Z')
  const echoed: string[] = []
  const log = createStartupLog(
    () => at,
    (text) => echoed.push(text),
  )
  log.line('desktop: starting')
  log.line('desktop: opened the product root')
  assert.deepEqual(readdirSync(dir), [], 'nothing on disk before the folder is known')
  log.attach(join(dir, 'logs'))
  log.line('desktop: the update was copied')
  const text = readFileSync(join(dir, 'logs', 'desktop-2026-11-24.log'), 'utf8')
  assert.equal(
    text,
    '2026-11-24T10:00:00.000Z desktop: starting\n2026-11-24T10:00:00.000Z desktop: opened the product root\n2026-11-24T10:00:00.000Z desktop: the update was copied\n',
  )
  assert.equal(echoed.length, 3)
})

test('a log that cannot be written never stops the start', () => {
  const log = createStartupLog()
  log.attach('\0not a folder')
  assert.doesNotThrow(() => log.line('still going'))
})

test('the console is mirrored into the log, with its level for warnings and errors, and can be given back', () => {
  const kept: string[] = []
  const calls: string[] = []
  const fake = {
    log: (...args: unknown[]) => calls.push(`log ${args.join(' ')}`),
    info: (...args: unknown[]) => calls.push(`info ${args.join(' ')}`),
    warn: (...args: unknown[]) => calls.push(`warn ${args.join(' ')}`),
    error: (...args: unknown[]) => calls.push(`error ${args.join(' ')}`),
  }
  const back = captureConsole(fake, { line: (text) => kept.push(text) })
  fake.log('desktop: %s ready', 'host')
  fake.warn('careful')
  fake.error(new Error('boom').message)
  assert.deepEqual(kept, ['desktop: host ready', 'warn: careful', 'error: boom'])
  assert.deepEqual(
    calls,
    ['log desktop: %s ready host', 'warn careful', 'error boom'],
    'the console still prints',
  )
  back()
  fake.log('after')
  assert.equal(kept.length, 3)
})

test('a locked file is the kind of error Windows gives for a file another program holds', () => {
  for (const code of ['EBUSY', 'EPERM', 'EACCES'])
    assert.equal(isLockedFileError({ code }), true, code)
  for (const code of ['ENOENT', 'ENOSPC', undefined])
    assert.equal(isLockedFileError({ code }), false, String(code))
  assert.equal(isLockedFileError('text'), false)
  assert.equal(isLockedFileError(null), false)
})

test('a locked file is tried again a few times; any other error, and the last locked one, are thrown at once', async () => {
  const waits: number[] = []
  const sleep = (ms: number): Promise<void> => {
    waits.push(ms)
    return Promise.resolve()
  }
  let calls = 0
  const flaky = async (): Promise<string> => {
    calls += 1
    if (calls < 3) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    return 'copied'
  }
  assert.equal(await retryLocked(flaky, { attempts: 3, delayMs: 5, sleep }), 'copied')
  assert.deepEqual(waits, [5, 5])

  waits.length = 0
  calls = 0
  await assert.rejects(
    retryLocked(
      async () => {
        calls += 1
        throw Object.assign(new Error('busy'), { code: 'EPERM' })
      },
      { attempts: 3, delayMs: 5, sleep },
    ),
    /busy/u,
  )
  assert.equal(calls, 3)
  assert.equal(waits.length, 2)

  calls = 0
  await assert.rejects(
    retryLocked(
      async () => {
        calls += 1
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      },
      { sleep },
    ),
    /disk full/u,
  )
  assert.equal(calls, 1, 'not retried')
})

test('the failure said to a person names the file, the cause in words, that the old version starts, and where the log is', () => {
  const locked = updateFailureText(
    'ACRYL Control Center',
    Object.assign(new Error('EBUSY: resource busy or locked'), {
      code: 'EBUSY',
      path: 'C:\\Users\\a\\plugins\\x.ts',
    }),
    'C:\\logs',
  )
  assert.equal(locked.message, 'ACRYL Control Center could not finish its update')
  assert.match(
    locked.detail,
    /A file is in use by another program \(C:\\Users\\a\\plugins\\x\.ts\)/u,
  )
  assert.match(locked.detail, /Task Manager/u)
  assert.match(locked.detail, /starts now with what is there: the old version/u)
  assert.match(locked.detail, /C:\\logs/u)
  const other = updateFailureText('ACRYL Control Center', new Error('no space left'), '/logs')
  assert.match(other.detail, /no space left/u)
  assert.doesNotMatch(other.detail, /in use by another program/u)
})

test("the update window is a page of its own: the product's name, escaped, and one line saying what happens", () => {
  const url = updateWindowUrl('A <b> & "C"')
  assert.ok(url.startsWith('data:text/html;charset=utf-8,'))
  const html = decodeURIComponent(url.slice('data:text/html;charset=utf-8,'.length))
  assert.match(html, /Updating A &lt;b&gt; &amp; &quot;C&quot;\.\.\./u)
  assert.doesNotMatch(html, /<b>/u)
})
