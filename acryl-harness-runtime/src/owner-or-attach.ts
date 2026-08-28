import type {
  AcrylSessionAttachment,
  AcrylSessionClient,
  AcrylSessionSnapshot,
  AcrylSessionSubscription,
} from 'acryl-control'
import { bootAcrylHarnessProfile, type AcrylHarnessRuntime } from './index.ts'
import {
  createAcrylSessionBridge,
  type AcrylSessionBridge,
} from './session-bridge.ts'

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
  sessionId: string
  disposed: boolean
}

const owners = new Map<string, OwnedRuntime>()

function requireProfile(profile: string): string {
  if (profile.trim() === '') throw new Error('ACRYL profile must not be empty')
  return profile
}

function clientFor(bridge: AcrylSessionBridge, attachment: AcrylSessionAttachment): AcrylSessionClient {
  const project = (snapshot: AcrylSessionSnapshot): AcrylSessionSnapshot => Object.freeze({
    ...snapshot,
    attachment,
  })
  return Object.freeze({
    async snapshot(sessionId: string): Promise<AcrylSessionSnapshot> {
      return project(await bridge.snapshot(sessionId))
    },
    async subscribe(
      sessionId: string,
      listener: (snapshot: AcrylSessionSnapshot) => void,
    ): Promise<AcrylSessionSubscription> {
      return bridge.subscribe(sessionId, snapshot => listener(project(snapshot)))
    },
    async submitPrompt(input: {
      readonly sessionId: string
      readonly text: string
      readonly clientCommandId: string
    }): Promise<void> {
      await bridge.submitPrompt(input)
    },
    async cancel(input: { readonly sessionId: string }): Promise<void> {
      await bridge.cancel(input.sessionId)
    },
  })
}

async function disposeOwner(owner: OwnedRuntime): Promise<void> {
  if (owner.disposed) return
  owner.disposed = true
  owners.delete(owner.profile)
  await owner.bridge.dispose()
  await owner.runtime.dispose()
}

/**
 * Select a fresh or resumed native durable session from the profile's one
 * in-process owner. A later control-endpoint attachment reuses this same
 * result shape without exposing Cordis or DSH services to callers.
 */
export async function openAcrylSessionOwnerOrAttach(
  options: AcrylOwnerOrAttachOptions,
): Promise<AcrylOwnerOrAttachResult> {
  const profile = requireProfile(options.profile)
  const existing = owners.get(profile)
  if (existing !== undefined && !existing.disposed) {
    if (options.resumeSessionId !== undefined && options.resumeSessionId !== existing.sessionId) {
      existing.sessionId = await existing.bridge.open(options.resumeSessionId)
    }
    return Object.freeze({
      attachment: 'attached',
      sessionId: existing.sessionId,
      client: clientFor(existing.bridge, 'attached'),
      async dispose(): Promise<void> {},
    })
  }

  const runtime = await bootAcrylHarnessProfile({ profile })
  const bridge = createAcrylSessionBridge(runtime.ctx, {
    profile,
    attachment: 'owner',
    cwd: options.cwd,
  })
  try {
    const sessionId = await bridge.open(options.resumeSessionId)
    const owner: OwnedRuntime = { runtime, bridge, profile, sessionId, disposed: false }
    owners.set(profile, owner)
    return Object.freeze({
      attachment: 'owner',
      sessionId,
      client: clientFor(bridge, 'owner'),
      async dispose(): Promise<void> {
        await disposeOwner(owner)
      },
    })
  } catch (error: unknown) {
    await bridge.dispose()
    await runtime.dispose()
    throw error
  }
}
