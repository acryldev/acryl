// Use case: give the app a remote repository, created through the user's own hosting login. A public repository for a private app is refused.
import { readAppIdentity, type Visibility } from './identity.js'
import type { GitPort, HostingPort } from './ports.js'

export type ConnectResult =
  | { readonly status: 'connected', readonly remote: string, readonly visibility: Visibility, readonly created: boolean }
  | { readonly status: 'refused', readonly reason: string }

export function connectRemote(
  input: { readonly manifestText: string, readonly name: string, readonly visibility?: Visibility, readonly url?: string },
  git: GitPort,
  hosting: HostingPort,
): ConnectResult {
  const identity = readAppIdentity(input.manifestText)
  const existing = git.remoteUrl()
  if (existing !== undefined) return { status: 'refused', reason: `this app already has a remote (${existing})` }
  const visibility = input.visibility ?? identity.visibility
  if (visibility === 'public' && identity.visibility === 'private') {
    return { status: 'refused', reason: 'this app is private (blend.yaml metadata.visibility); set visibility: public first if you mean to publish its code' }
  }
  if (!git.isRepository()) git.init()
  if (input.url !== undefined) {
    const known = hosting.visibilityOf(input.url)
    if (identity.visibility === 'private' && known === 'public') return { status: 'refused', reason: `${input.url} is public and this app is private` }
    git.addRemote(input.url)
    return { status: 'connected', remote: input.url, visibility: known === 'unknown' ? visibility : known, created: false }
  }
  const remote = hosting.create(input.name, visibility)
  git.addRemote(remote)
  return { status: 'connected', remote, visibility, created: true }
}
