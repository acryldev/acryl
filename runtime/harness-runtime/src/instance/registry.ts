/**
 * Registry (Patterns of Enterprise Application Architecture) of running apps: each running app announces itself with one small file, so `ps` finds apps
 * wherever their folders are. An announcement whose process is gone is dropped when read. The registry lives in the OS user's `~/.acryl-instances/.running`
 * and holds only pointers (id, folder, pid, surface, port), never app data.
 *
 * @module acryl-harness-runtime/instance/registry
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MANAGED_HOMES_DIR_NAME, type AppInstance } from './app-instance.ts'
import { processIsAlive, readLock } from './offline-lock.ts'

export interface RunningApp {
  readonly id: string
  readonly name: string
  readonly home: string
  readonly pid: number
  readonly surface?: string
  readonly definition?: string
  readonly port?: number
  readonly since?: string
}

export function registryDir(osHome: string): string {
  return join(osHome, MANAGED_HOMES_DIR_NAME, '.running')
}

export function announce(osHome: string, instance: AppInstance, info: { readonly pid: number, readonly surface?: string, readonly port?: number }): void {
  const dir = registryDir(osHome)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const entry = { id: instance.id, name: instance.name, home: instance.home, ...(instance.definitionFile === undefined ? {} : { definition: instance.definitionFile }), ...info, since: new Date().toISOString() }
  writeFileSync(join(dir, `${instance.id}.json`), `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 })
}

export function withdraw(osHome: string, instance: AppInstance, pid: number = process.pid): void {
  const file = join(registryDir(osHome), `${instance.id}.json`)
  if (readLock(file)?.pid === pid) rmSync(file, { force: true })
}

export function listRunning(osHome: string, alive: (pid: number) => boolean = processIsAlive): readonly RunningApp[] {
  const dir = registryDir(osHome)
  if (!existsSync(dir)) return []
  const running: RunningApp[] = []
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry)
    const value = readLock(file) as unknown as RunningApp | undefined
    if (value === undefined) continue
    if (!alive(value.pid)) { rmSync(file, { force: true }); continue }
    running.push(value)
  }
  return running.sort((a, b) => a.id.localeCompare(b.id))
}
