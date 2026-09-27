/**
 * `acryl save` and `acryl remote connect` (spec 036, persistence-and-registries.md): an app's own repository, driven from the command line with the
 * user's own git and gh. The rules (secret check, private/public guard) are `@webboxes/app-persistence`'s; this adapter finds the app and reports.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { connectRemote, gitCli, githubHosting, saveApp, type ConnectResult, type SaveResult } from '@webboxes/app-persistence'

function appDefinition(dir: string): { root: string, manifestText: string } {
  const root = resolve(dir)
  const file = join(root, 'blend.yaml')
  if (!existsSync(file)) throw new Error(`${root} is not an app (no blend.yaml); run this inside an app created with acryl new, or pass --dir`)
  return { root, manifestText: readFileSync(file, 'utf8') }
}

export function runSave(options: { readonly dir: string, readonly message?: string }): SaveResult {
  const { root, manifestText } = appDefinition(options.dir)
  return saveApp({ manifestText, message: options.message ?? `Save ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` }, gitCli(root), githubHosting(root))
}

export function runRemoteConnect(options: { readonly dir: string, readonly name?: string, readonly url?: string, readonly visibility?: 'private' | 'public' }): ConnectResult {
  const { root, manifestText } = appDefinition(options.dir)
  return connectRemote({ manifestText, name: options.name ?? basename(root), ...(options.url === undefined ? {} : { url: options.url }), ...(options.visibility === undefined ? {} : { visibility: options.visibility }) }, gitCli(root), githubHosting(root))
}

export function describeSave(result: SaveResult): { lines: string[], exitCode: number } {
  if (result.status === 'saved') return { lines: [`Saved ${result.commit.slice(0, 8)}${result.pushed ? ` and pushed to ${result.remote ?? 'the remote'}` : ' (no remote yet: acryl remote connect)'}.`], exitCode: 0 }
  if (result.status === 'nothing-to-save') return { lines: ['Nothing to save: the app has no changes since the last save.'], exitCode: 0 }
  return { lines: [`Not saved: ${result.reason}`, ...(result.secrets ?? []).map(found => `  ${found.path}${found.line > 0 ? `:${String(found.line)}` : ''}  ${found.kind}`)], exitCode: 1 }
}

export function describeConnect(result: ConnectResult): { lines: string[], exitCode: number } {
  if (result.status === 'connected') return { lines: [`${result.created ? 'Created' : 'Connected'} ${result.visibility} repository ${result.remote}. Save with: acryl save`], exitCode: 0 }
  return { lines: [`Not connected: ${result.reason}`], exitCode: 1 }
}
