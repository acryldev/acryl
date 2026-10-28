/**
 * A composition root announces the app it serves (spec 048 T011): the process that serves takes the app's run lock and writes the Registry entry with the
 * port it really bound, so `acryl control list` finds an app started by `pnpm web`, Desktop or the CLI. It withdraws both when it exits, refuses a second
 * live app on the same instance, and takes over a claim whose process is gone.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  InstanceAnnounceError,
  announceSelf,
  appFolder,
  listRunning,
  readLock,
} from '../src/instance/index.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const temp = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-announce-'))); dirs.push(dir); return dir }
/** An app folder (`bin/acryl` runs one), so the instance is pinned to it and not to the OS home. */
const app = (root: string): string => { const dir = join(root, 'notes'); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'blend.yaml'), 'x'); return dir }
const alive = (pids: number[]): ((pid: number) => boolean) => pid => pids.includes(pid)

describe('announceSelf', () => {
  it('announces the app with the port it bound, and the listing shows it', () => {
    const osHome = temp()
    const instance = appFolder(app(temp()), osHome)
    const announced = announceSelf(instance, { surface: 'web', port: 3107, pid: 4242, osHome })
    expect(announced.id).toBe(instance.id)
    expect(announced.port).toBe(3107)
    const [entry] = listRunning(osHome, alive([4242]))
    expect(entry).toMatchObject({ id: instance.id, home: instance.home, pid: 4242, surface: 'web', port: 3107 })
    expect(readLock(instance.runLockFile)).toMatchObject({ pid: 4242, surface: 'web', port: 3107 })
  })

  it('withdraws the announcement and the claim on release, once', () => {
    const osHome = temp()
    const instance = appFolder(app(temp()), osHome)
    const announced = announceSelf(instance, { surface: 'desktop', port: 3108, pid: 4243, osHome })
    announced.release()
    expect(listRunning(osHome, alive([4243]))).toEqual([])
    expect(readLock(instance.runLockFile)).toBeUndefined()
    announced.release()
    expect(listRunning(osHome, alive([4243]))).toEqual([])
  })

  it('refuses a second live app on the same instance, naming the holder', () => {
    const osHome = temp()
    const instance = appFolder(app(temp()), osHome)
    announceSelf(instance, { surface: 'web', port: 3107, pid: 4244, osHome })
    let refused: unknown
    try { announceSelf(instance, { surface: 'desktop', port: 3109, pid: 4245, osHome, alive: alive([4244]) }) } catch (error) { refused = error }
    expect(refused).toBeInstanceOf(InstanceAnnounceError)
    expect((refused as Error).message).toBe(`app "${instance.id}" is already running (pid 4244, web, port 3107). Stop it (node scripts/instances.mjs stop ${instance.id}) or start another app.`)
    // The refused process changed neither the claim nor the announcement.
    expect(readLock(instance.runLockFile)).toMatchObject({ pid: 4244, surface: 'web' })
    expect(listRunning(osHome, alive([4244, 4245]))[0]).toMatchObject({ pid: 4244, port: 3107 })
  })

  it('takes over the claim of a process that is gone, and the older holder cannot take the newer claim down', () => {
    const osHome = temp()
    const instance = appFolder(app(temp()), osHome)
    const older = announceSelf(instance, { surface: 'web', port: 3107, pid: 4246, osHome })
    const newer = announceSelf(instance, { surface: 'web', port: 3110, pid: 4247, osHome, alive: alive([4247]) })
    expect(listRunning(osHome, alive([4247]))[0]).toMatchObject({ pid: 4247, port: 3110 })
    older.release()
    expect(readLock(instance.runLockFile)).toMatchObject({ pid: 4247 })
    expect(listRunning(osHome, alive([4247]))[0]).toMatchObject({ pid: 4247, port: 3110 })
    newer.release()
    expect(readLock(instance.runLockFile)).toBeUndefined()
    expect(listRunning(osHome, alive([4247]))).toEqual([])
  })

  it('keeps its own claim when the same process announces again (an engine swap under one root)', () => {
    const osHome = temp()
    const instance = appFolder(app(temp()), osHome)
    announceSelf(instance, { surface: 'web', port: 3107, pid: 4248, osHome })
    const again = announceSelf(instance, { surface: 'web', port: 3112, pid: 4248, osHome })
    expect(listRunning(osHome, alive([4248]))[0]).toMatchObject({ pid: 4248, port: 3112 })
    again.release()
    expect(readLock(instance.runLockFile)).toBeUndefined()
  })
})
