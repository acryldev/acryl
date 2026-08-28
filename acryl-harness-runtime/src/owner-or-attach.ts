import { randomUUID } from 'node:crypto'
import type {
  AcrylSessionAttachment,
  AcrylSessionClient,
  AcrylSessionSnapshot,
  AcrylSessionSubscription,
} from 'acryl-control'
import { bootAcrylHarnessProfile, type AcrylHarnessRuntime } from './index.ts'
import { createAcrylSessionBridge, type AcrylSessionBridge } from './session-bridge.ts'

export interface AcrylOwnerOrAttachOptions {
  readonly profile: string
  readonly cwd: string
  readonly resumeSessionId?: string
}

export interface AcrylOwnerOrAttachResult {
  readonly attachment: AcrylSessionAttachment
  readonly sessionId: string
  readonly client: AcrylSessionClient
  dispose(): Promise<void>
}

interface OwnedRuntime {
  readonly runtime: AcrylHarnessRuntime
  readonly bridge: AcrylSessionBridge
  readonly profile: string
  readonly generationId: string
  sessionId: string
  disposed: boolean
  closing: Promise<void> | undefined
}

/** A promise is installed before boot starts, making ownership reservation atomic. */
const owners = new Map<string, Promise<OwnedRuntime>>()

function requireProfile(profile: string): string {
  if (profile.trim() === '') throw new Error('ACRYL profile must not be empty')
  return profile
}

function clientFor(
  bridge: AcrylSessionBridge,
  attachment: AcrylSessionAttachment,
): AcrylSessionClient {
  const project = (snapshot: AcrylSessionSnapshot): AcrylSessionSnapshot => Object.freeze({ ...snapshot, attachment })
  const requireOwner = (): void => {
    if (attachment !== 'owner') throw new Error('ACRYL attached clients are read-only')
  }
  return Object.freeze({
    async snapshot(sessionId: string): Promise<AcrylSessionSnapshot> {
      return project(await bridge.snapshot(sessionId))
    },
    async subscribe(sessionId: string, listener: (snapshot: AcrylSessionSnapshot) => void): Promise<AcrylSessionSubscription> {
      return bridge.subscribe(sessionId, snapshot => listener(project(snapshot)))
    },
    async submitPrompt(input: { readonly sessionId: string; readonly text: string; readonly clientCommandId: string }): Promise<void> {
      requireOwner()
      await bridge.submitPrompt(input)
    },
    async cancel(input: { readonly sessionId: string }): Promise<void> {
      requireOwner()
      await bridge.cancel(input.sessionId)
    },
  })
}

async function startOwner(options: AcrylOwnerOrAttachOptions, profile: string): Promise<OwnedRuntime> {
  const runtime = await bootAcrylHarnessProfile({ profile })
  const generationId = randomUUID()
  const bridge = createAcrylSessionBridge(runtime.ctx, {
    profile,
    generationId,
    attachment: 'owner',
    cwd: options.cwd,
  })
  try {
    const sessionId = await bridge.open(options.resumeSessionId)
    return { runtime, bridge, profile, generationId, sessionId, disposed: false, closing: undefined }
  } catch (error: unknown) {
    await bridge.dispose()
    await runtime.dispose()
    throw error
  }
}

async function disposeOwner(owner: OwnedRuntime): Promise<void> {
  if (owner.closing !== undefined) return owner.closing
  owner.disposed = true
  owner.closing = (async () => {
    await owner.bridge.dispose()
    await owner.runtime.dispose()
    owners.delete(owner.profile)
  })()
  return owner.closing
}

/**
 * Select a durable session from the profile's sole in-process owner. The map
 * reserves ownership before boot and keeps that reservation through shutdown.
 */
export async function openAcrylSessionOwnerOrAttach(options: AcrylOwnerOrAttachOptions): Promise<AcrylOwnerOrAttachResult> {
  const profile = requireProfile(options.profile)
  let ownerPromise = owners.get(profile)
  let attachment: AcrylSessionAttachment = 'attached'
  if (ownerPromise === undefined) {
    attachment = 'owner'
    ownerPromise = startOwner(options, profile)
    owners.set(profile, ownerPromise)
    void ownerPromise.catch(() => {
      if (owners.get(profile) === ownerPromise) owners.delete(profile)
    })
  }
  const owner = await ownerPromise
  if (owner.disposed) {
    await owner.closing
    return openAcrylSessionOwnerOrAttach(options)
  }
  if (attachment === 'owner') {
    return Object.freeze({
      attachment,
      sessionId: owner.sessionId,
      client: clientFor(owner.bridge, attachment),
      async dispose(): Promise<void> { await disposeOwner(owner) },
    })
  }
  if (options.resumeSessionId !== undefined && options.resumeSessionId !== owner.sessionId) {
    throw new Error('ACRYL attached clients cannot select another session')
  }
  return Object.freeze({
    attachment,
    sessionId: owner.sessionId,
    client: clientFor(owner.bridge, attachment),
    async dispose(): Promise<void> {},
  })
}
