// Use case: save the app to its own repository (commit, and push when it has a remote), refusing a secret or a private app going public.
import { findSecrets, type SecretFinding } from './secrets.js'
import { readAppIdentity } from './identity.js'
import type { GitPort, HostingPort } from './ports.js'

export type SaveResult =
  | { readonly status: 'saved', readonly commit: string, readonly pushed: boolean, readonly remote?: string }
  | { readonly status: 'nothing-to-save' }
  | { readonly status: 'refused', readonly reason: string, readonly secrets?: readonly SecretFinding[] }

export function saveApp(input: { readonly manifestText: string, readonly message: string }, git: GitPort, hosting: HostingPort): SaveResult {
  const identity = readAppIdentity(input.manifestText)
  const remote = git.remoteUrl()
  // The guard first, before anything is staged: a private app never goes to a public remote.
  if (remote !== undefined && identity.visibility === 'private' && hosting.visibilityOf(remote) === 'public') {
    return { status: 'refused', reason: `this app is private (blend.yaml metadata.visibility) but its remote ${remote} is public. Make the remote private, or set visibility: public if you mean to open it.` }
  }
  if (!git.isRepository()) git.init()
  git.stageAll()
  if (!git.hasStagedChanges()) return { status: 'nothing-to-save' }
  const secrets = findSecrets(git.stagedFiles().flatMap(path => { const text = git.stagedText(path); return text === undefined ? [] : [{ path, text }] }))
  if (secrets.length > 0) {
    git.unstageAll()
    return { status: 'refused', reason: 'these files contain what looks like a secret; nothing was saved. Move the value out of the app (a provider key belongs in the app\'s settings, which are not committed).', secrets }
  }
  const commit = git.commit(input.message)
  if (remote === undefined) return { status: 'saved', commit, pushed: false }
  git.push()
  return { status: 'saved', commit, pushed: true, remote }
}
