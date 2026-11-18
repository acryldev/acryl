/**
 * An extension's browser half. A DSH plugin can be a dual package: its server half is the plugin the extensions service mounts, and its
 * browser half is the `./client` bundle that `package.json` names under `dsh.client` (`platform: "web"`). The frame's client-modules
 * serves a browser half only for a package that a host Loader row names, and an extension is a child fiber, not a row. So an extension
 * with a browser half also gets one row in the running host: it names a module that does nothing, in a folder of the app's home whose
 * `package.json` carries the plugin's `dsh` field and points `./client` back at the plugin's own bundle. The row lives exactly as long as
 * the extension's fiber (an effect on it), so an update, a failed update, a remove and the app's stop all take it away.
 *
 * Nothing is written to the app's Loader file: the row exists in the running host only (`loader.root.create`, not `loader.create`).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

/** The part of the host Loader this needs: rows added to and removed from its root group without writing its file. */
interface LoaderRoot {
  readonly root: {
    create(options: { readonly name: string }): Promise<string>
    remove(id: string): void
  }
}

/** What a package declares for its browser half, or undefined when it has none for the web. */
export function browserHalf(
  dir: string,
): { readonly manifest: Record<string, unknown>; readonly client: string } | undefined {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return undefined
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const dsh = manifest.dsh as { client?: { platform?: unknown } } | undefined
  if (dsh?.client?.platform !== 'web') return undefined
  const exported = (manifest.exports as Record<string, unknown> | undefined)?.['./client']
  const path =
    typeof exported === 'string'
      ? exported
      : (exported as { default?: unknown } | undefined)?.default
  if (typeof path !== 'string') return undefined
  const client = join(dir, path)
  return existsSync(client) ? { manifest, client } : undefined
}

/** The folder of the row's module and manifest, written once per version. */
export function writeBrowserRow(
  home: string,
  name: string,
  version: string,
  half: NonNullable<ReturnType<typeof browserHalf>>,
): string {
  const folder = join(home, 'extensions-browser', `${name}-${version}`)
  mkdirSync(folder, { recursive: true })
  const manifest = {
    name: half.manifest.name,
    version: half.manifest.version,
    type: 'module',
    dsh: half.manifest.dsh,
    // client-modules joins this to the folder, so a relative path reaches the plugin's own bundle without a copy.
    exports: { '.': './row.mjs', './client': relative(folder, half.client).split('\\').join('/') },
  }
  writeFileSync(join(folder, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(
    join(folder, 'row.mjs'),
    `// The host row that makes the frame serve ${String(half.manifest.name)}'s browser half; its server half runs as an extension.\nexport const name = ${JSON.stringify(`${name}-browser`)}\nexport function apply() {}\n`,
  )
  return folder
}

/** Give a mounted extension's browser half a host row for as long as its fiber lives; nothing when it has none or the host has no Loader. */
export function attachBrowserHalf(
  fiberCtx: Context,
  home: string,
  name: string,
  version: string,
  dir: string,
): void {
  const half = browserHalf(dir)
  const loader = fiberCtx.get('loader') as LoaderRoot | undefined
  if (half === undefined || loader?.root === undefined) return
  fiberCtx.effect(() => {
    const folder = writeBrowserRow(home, name, version, half)
    let id: string | undefined
    let gone = false
    loader.root
      .create({ name: pathToFileURL(join(folder, 'row.mjs')).href })
      .then((created) => {
        if (gone) loader.root.remove(created)
        else id = created
      })
      .catch((error: unknown) =>
        fiberCtx
          .logger('extensions')
          .warn(`${name}: its browser half did not load: ${String(error)}`),
      )
    return () => {
      gone = true
      if (id !== undefined) loader.root.remove(id)
      rmSync(folder, { recursive: true, force: true })
    }
  }, `extensions: ${name}'s browser half`)
}
