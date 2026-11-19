/**
 * The save plugin: gives an agent a `save_app` tool when the app has a tool registry. Saving itself is `saveApp` from
 * `@webboxes/app-persistence` (ACRYL's own) over the user's own git; `npm run save` runs the same use case from a terminal (cli.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { gitCli, githubHosting, type SaveResult, saveApp } from '@webboxes/app-persistence'

export {
  findSecrets,
  type GitPort,
  gitCli,
  githubHosting,
  type HostingPort,
  PersistenceError,
  readAppIdentity,
  type SaveResult,
  type SecretFinding,
  saveApp,
  type Visibility,
} from '@webboxes/app-persistence'

/** Save the app folder: its blend.yaml decides the visibility. */
export function saveFolder(appRoot: string, message: string): SaveResult {
  const manifestText = readFileSync(join(appRoot, 'blend.yaml'), 'utf8')
  return saveApp({ manifestText, message }, gitCli(appRoot), githubHosting(appRoot))
}

interface ToolRegistry {
  register(name: string, tool: { description: string; run(input: unknown): unknown }): () => void
}

export const save = {
  name: 'save',
  inject: ['appInstance'],
  apply(ctx: Context) {
    const registry = (ctx.get as (name: string) => unknown)('tools') as ToolRegistry | undefined
    if (!registry) return
    const root = (ctx.get as (name: string) => { root: string })('appInstance').root
    ctx.effect(() =>
      registry.register('save_app', {
        description:
          'Commit the app (and push if it has a remote). Refuses a file that holds a secret. Input { message }.',
        run: (input) => {
          const message = (input as { message?: unknown } | undefined)?.message
          return saveFolder(
            root,
            typeof message === 'string' && message.trim() ? message : 'save the app',
          )
        },
      }),
    )
  },
}
