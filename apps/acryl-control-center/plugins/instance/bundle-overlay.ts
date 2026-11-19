/**
 * The frame host's first preload in a desktop product (`--import`, before the node server's): it registers `bundle.ts`'s resolver, so the Program
 * resolves from the bundle and the person's files from the app's source. A no-op in an app made with `acrylblends init`, which is one folder.
 */
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { appTree, overlayResolve } from './bundle.ts'

const tree = appTree(process.env, fileURLToPath(new URL('../../', import.meta.url)))
if (tree !== undefined) registerHooks({ resolve: overlayResolve(tree) })
