/**
 * The builder: the agent's tools for extending the app it runs in.
 *
 * Extracted from ACRYL's agent tools (`acryl_install_plugin` and its extension docs): the agent writes a plugin into the app's own
 * extensions folder, installs it, and gets back the real result (`active`, `pending` with what it waits for, or the error, with the
 * previous version restored). Writes are confined to that folder. The tools register in `ctx.effect`, so they leave with the builder.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { scripted, type Tools } from '../agent/index.ts'
import { NAME } from '../extensions/index.ts'
import type {} from '../instance/index.ts'
import { packagePlugin } from '../plugin-share/package.ts'
import { builderRules } from './script.ts'

export interface BuilderConfig {
  /** Where the agent writes extensions. Defaults to `<project>/plugins`. Must be one of the extensions sources. */
  dir?: string
  /** Where `package_plugin` writes standalone packages. Defaults to `<project>/plugin-packages`. */
  packagesDir?: string
}

const EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.json', '.md'])
const MAX_BYTES = 256 * 1024

export class BuilderError extends Error {
  override name = 'BuilderError'
}

function pluginName(input: unknown): string {
  const name = (input as { name?: unknown } | undefined)?.name
  if (typeof name !== 'string' || !NAME.test(name))
    throw new BuilderError('name must be lowercase letters, digits and dashes')
  return name
}

/** A relative file path inside a plugin folder, or an error. */
function safeFile(path: string): string {
  const clean = normalize(path)
  if (isAbsolute(path) || clean.startsWith('..') || clean.split(sep).includes('..'))
    throw new BuilderError(`"${path}" must be a path inside the plugin folder`)
  if (!EXTENSIONS.has(extname(clean)))
    throw new BuilderError(`"${path}": only ${[...EXTENSIONS].join(', ')} files may be written`)
  return clean
}

export const builder = {
  name: 'builder',
  inject: ['extensions', 'tools', 'appInstance'],
  apply(ctx: Context, config: BuilderConfig) {
    const dir = resolve(config?.dir ?? join(ctx.appInstance.root, 'plugins'))
    if (!ctx.extensions.sources.some((source) => resolve(source.dir) === dir)) {
      throw new BuilderError(
        `the builder writes into ${dir}, which is not an extensions source; add it to the extensions plugin's sources`,
      )
    }
    const folder = (name: string) => join(dir, name)
    const tools: Tools = ctx.tools
    const register = (name: string, description: string, run: (input: unknown) => unknown) =>
      ctx.effect(() => tools.register(name, { description, run }))

    register(
      'list_plugins',
      'List installed extensions with their state, and folders not installed yet.',
      () => ({
        installed: ctx.extensions.list(),
        notInstalled: ctx.extensions.pending(),
      }),
    )

    register(
      'read_plugin',
      'Read a file of an extension: input { name, file? } (default index.ts).',
      (input) => {
        const name = pluginName(input)
        const file = safeFile((input as { file?: string }).file ?? 'index.ts')
        const path = join(folder(name), file)
        if (!existsSync(path)) throw new BuilderError(`${name}/${file} does not exist`)
        return { name, file, text: readFileSync(path, 'utf8') }
      },
    )

    register(
      'write_plugin',
      'Write files of an extension: input { name, files: { "index.ts": "..." } }. The folder is created; other files are kept.',
      (input) => {
        const name = pluginName(input)
        const files = (input as { files?: unknown }).files
        if (!files || typeof files !== 'object')
          throw new BuilderError('files must be an object of path to text')
        const entries = Object.entries(files as Record<string, unknown>)
        const bytes = entries.reduce(
          (total, [, text]) => total + Buffer.byteLength(String(text)),
          0,
        )
        if (entries.length === 0) throw new BuilderError('files is empty')
        if (bytes > MAX_BYTES)
          throw new BuilderError(`files are ${bytes} bytes; the limit is ${MAX_BYTES}`)
        const written: string[] = []
        for (const [path, text] of entries) {
          if (typeof text !== 'string') throw new BuilderError(`${path}: the content must be text`)
          const file = safeFile(path)
          const target = join(folder(name), file)
          if (relative(folder(name), target).startsWith('..'))
            throw new BuilderError(`"${path}" leaves the plugin folder`)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, text)
          written.push(file)
        }
        return { ok: true, name, dir: folder(name), written }
      },
    )

    register(
      'install_plugin',
      'Install or update an extension from its folder: input { name }. Returns its real state.',
      (input) => ctx.extensions.install(folder(pluginName(input))),
    )

    register(
      'remove_plugin',
      'Remove an installed extension: input { name, deleteSource? }. deleteSource also deletes its folder.',
      async (input) => {
        const name = pluginName(input)
        const result = await ctx.extensions.remove(name)
        if (
          (input as { deleteSource?: unknown }).deleteSource === true &&
          existsSync(folder(name))
        ) {
          rmSync(folder(name), { recursive: true, force: true })
        }
        return result
      },
    )

    const packagesDir = resolve(
      config?.packagesDir ?? join(ctx.appInstance.root, 'plugin-packages'),
    )
    register(
      'package_plugin',
      'Turn an extension into a standalone plugin package other apps can pull: input { name, description? }. Writes the package folder and its release .tgz, the same bytes on every OS. Returns the folder, the file, its sha512 and its content digest.',
      async (input) => {
        const name = pluginName(input)
        if (
          !existsSync(join(folder(name), 'index.ts')) &&
          !existsSync(join(folder(name), 'index.js'))
        ) {
          throw new BuilderError(`${name} has no index.ts in ${folder(name)}; write it first`)
        }
        const description = String(
          (input as { description?: unknown }).description ?? `The ${name} Cordis plugin.`,
        )
        try {
          return {
            ok: true,
            name,
            ...(await packagePlugin(folder(name), packagesDir, name, description)),
          }
        } catch (cause) {
          throw new BuilderError(
            `${name}: ${cause instanceof Error ? cause.message : String(cause)}`,
          )
        }
      },
    )

    const model = scripted(ctx.get('model'))
    if (model) ctx.effect(() => model.teach(builderRules))
  },
}
