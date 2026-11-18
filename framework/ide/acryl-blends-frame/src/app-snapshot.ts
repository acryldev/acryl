/**
 * The app's snapshot verbs as the frame's service `appSnapshot`: every version the frame saves (Save point, the auto-save) is captured first, so
 * a version is always a snapshot whose `blend.yaml` names every plugin folder and whose lock matches; the agent's snapshot tools
 * (acryl-app-context) run on it too, the same code as `npm run snapshot`. The verbs are the app's own (`plugins/manifest/snapshot.ts`, part of the app's
 * folder), so the frame runs the version the app was made with; an app made before them says so instead of guessing. Pushing and pulling are
 * not here: they are the person's (the Git tab and the versions header, ./git-sync.ts), and a push sends only a plan they confirmed.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { GitRemoteState, SnapshotApply, SnapshotCapture, SnapshotVerify } from './contract.ts'

/** Where the verbs are in an app folder. */
export const SNAPSHOT_MODULE = 'plugins/manifest/snapshot.ts'

/** An app made before the snapshot verbs: a save goes on without a capture, a tool says so. */
export class SnapshotVerbsMissing extends Error {}

/** The verbs as the app's module exports them. */
export interface SnapshotVerbs {
  captureApp(appRoot: string): SnapshotCapture
  verifyApp(dir: string): SnapshotVerify
  applySnapshot(from: string, appRoot: string): SnapshotApply
}

/** The branch's remote as the Git tab reads it. */
export interface VersionRemote {
  state(options?: { readonly fetch?: boolean }): Promise<GitRemoteState>
}

export interface AppSnapshotService {
  /** A row for every plugin folder of the app that has none, then `blend.lock.json`. @throws when the app has no snapshot verbs. */
  capture(): Promise<SnapshotCapture>
  /**
   * The capture every version starts with (Save point and the auto-save): undefined when the app was made before the verbs, so the version is
   * saved as before. @throws what else stops a capture (a `blend.yaml` that does not parse).
   */
  captureForSave(): Promise<SnapshotCapture | undefined>
  /** The app (or another snapshot folder, relative to the app) checked against its own lock, offline. */
  verify(dir?: string): Promise<SnapshotVerify>
  /** Brings another snapshot folder into the app; writes nothing on a conflict. Only on the person's word: it changes the app's composition. */
  apply(dir: string): Promise<SnapshotApply>
  /** The checked-out branch against its remote; `fetch` asks the remote first. */
  remote(fetch?: boolean): Promise<GitRemoteState>
}

const isVerbs = (value: unknown): value is SnapshotVerbs => {
  const verbs = value as Partial<Record<keyof SnapshotVerbs, unknown>> | undefined
  return typeof verbs?.captureApp === 'function' && typeof verbs.verifyApp === 'function' && typeof verbs.applySnapshot === 'function'
}

/** Imports the app's own verbs. @throws a sentence naming the missing file when the app was made before them. */
export async function loadSnapshotVerbs(root: string): Promise<SnapshotVerbs> {
  const file = join(root, SNAPSHOT_MODULE)
  if (!existsSync(file)) throw new SnapshotVerbsMissing(`This app has no ${SNAPSHOT_MODULE}: it was made before the snapshot verbs. Make a new app, or copy the file from a new one.`)
  const module: unknown = await import(pathToFileURL(file).href)
  if (!isVerbs(module)) throw new Error(`${SNAPSHOT_MODULE} does not export captureApp, verifyApp and applySnapshot.`)
  return module
}

/**
 * @param load - the app's verbs; read once, on first use (a test passes its own).
 * Capture and apply write `blend.yaml`, the lock and plugin folders: they run one at a time, and a verify waits for the write before it.
 */
export function createAppSnapshot(root: string, remote: VersionRemote, load: () => Promise<SnapshotVerbs> = () => loadSnapshotVerbs(root)): AppSnapshotService {
  let verbs: Promise<SnapshotVerbs> | undefined
  const loaded = (): Promise<SnapshotVerbs> => {
    verbs ??= load().catch((cause: unknown) => {
      verbs = undefined
      throw cause
    })
    return verbs
  }
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(step: (verbs: SnapshotVerbs) => T): Promise<T> => {
    const next = queue.then(async () => step(await loaded()))
    queue = next.catch(() => undefined)
    return next
  }
  const inApp = (dir: string): string => (isAbsolute(dir) ? dir : resolve(root, dir))
  return {
    capture: () => serial(verbs => verbs.captureApp(root)),
    captureForSave: () => serial(verbs => verbs.captureApp(root)).catch((cause: unknown) => {
      if (cause instanceof SnapshotVerbsMissing) return undefined
      throw cause
    }),
    verify: dir => serial(verbs => verbs.verifyApp(dir === undefined || dir === '' ? root : inApp(dir))),
    apply: dir => serial(verbs => {
      const from = inApp(dir)
      if (from === root) throw new Error('A snapshot is applied from another folder than the app itself.')
      return verbs.applySnapshot(from, root)
    }),
    remote: fetch => remote.state({ fetch: fetch === true }),
  }
}
