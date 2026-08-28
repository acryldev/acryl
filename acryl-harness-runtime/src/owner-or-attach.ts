import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  createAcrylEndpointSessionClient,
  type AcrylSessionAttachment,
  type AcrylSessionClient,
} from 'acryl-control'
import { bootAcrylHarnessProfile, type AcrylHarnessRuntime } from './index.ts'
import { createAcrylSessionBridge, type AcrylSessionBridge } from './session-bridge.ts'
import { mountAcrylSessionControlEndpoint, type AcrylSessionControlEndpoint } from './session-control-endpoint.ts'

export interface AcrylOwnerOrAttachOptions { readonly profile: string; readonly cwd: string; readonly resumeSessionId?: string }
export interface AcrylOwnerOrAttachResult { readonly attachment: AcrylSessionAttachment; readonly sessionId: string; readonly client: AcrylSessionClient; dispose(): Promise<void> }
interface OwnedRuntime {
  readonly runtime: AcrylHarnessRuntime
  readonly bridge: AcrylSessionBridge
  readonly profile: string
  readonly generationId: string
  readonly endpoint: AcrylSessionControlEndpoint
  sessionId: string
  disposed: boolean
  closing: Promise<void> | undefined
}
const owners = new Map<string, Promise<OwnedRuntime>>()
function requireProfile(profile: string): string { if (profile.trim() === '') throw new Error('ACRYL profile must not be empty'); return profile }
function clientFor(endpoint: AcrylSessionControlEndpoint, generationId: string, attachment: AcrylSessionAttachment): AcrylSessionClient {
  return createAcrylEndpointSessionClient(endpoint.endpoint, generationId, attachment)
}
async function startOwner(options: AcrylOwnerOrAttachOptions, profile: string): Promise<OwnedRuntime> {
  const runtime = await bootAcrylHarnessProfile({ profile })
  const generationId = randomUUID()
  const bridge = createAcrylSessionBridge(runtime.ctx, { profile, generationId, attachment: 'owner', cwd: options.cwd })
  try {
    const sessionId = await bridge.open(options.resumeSessionId)
    const endpoint = await mountAcrylSessionControlEndpoint(runtime.ctx, bridge, {
      address: join('/tmp', `acryl-${createHash('sha256').update(`${profile}:${generationId}`).digest('hex').slice(0, 24)}.sock`),
      generationId,
    })
    return { runtime, bridge, profile, generationId, endpoint, sessionId, disposed: false, closing: undefined }
  } catch (error: unknown) { await bridge.dispose(); await runtime.dispose(); throw error }
}
async function disposeOwner(owner: OwnedRuntime): Promise<void> {
  if (owner.closing !== undefined) return owner.closing
  owner.disposed = true
  owner.closing = (async () => { await owner.endpoint.dispose(); await owner.bridge.dispose(); await owner.runtime.dispose(); owners.delete(owner.profile) })()
  return owner.closing
}
/** Select a durable session from the profile's sole in-process owner. */
export async function openAcrylSessionOwnerOrAttach(options: AcrylOwnerOrAttachOptions): Promise<AcrylOwnerOrAttachResult> {
  const profile = requireProfile(options.profile)
  let ownerPromise = owners.get(profile)
  let attachment: AcrylSessionAttachment = 'attached'
  if (ownerPromise === undefined) {
    attachment = 'owner'; ownerPromise = startOwner(options, profile); owners.set(profile, ownerPromise)
    void ownerPromise.catch(() => { if (owners.get(profile) === ownerPromise) owners.delete(profile) })
  }
  const owner = await ownerPromise
  if (owner.disposed) { await owner.closing; return openAcrylSessionOwnerOrAttach(options) }
  if (attachment === 'attached' && options.resumeSessionId !== undefined && options.resumeSessionId !== owner.sessionId) throw new Error('ACRYL attached clients cannot select another session')
  return Object.freeze({ attachment, sessionId: owner.sessionId, client: clientFor(owner.endpoint, owner.generationId, attachment), async dispose() { if (attachment === 'owner') await disposeOwner(owner) } })
}
