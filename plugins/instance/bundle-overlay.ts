/**
 * The frame host's first preload in a desktop product (`--import`, before the node server's): it registers `bundle.ts`'s resolver, so the Program
 * resolves from the bundle and the person's files from the app's source. A no-op in an app made with `acrylblends init`, which is one folder.
 */
import { registerHooks } from 'node:module'
import { appTree, overlayResolve } from './bundle.ts'
import { PROGRAM_ENV } from './index.ts'

const program = process.env[PROGRAM_ENV]?.trim()
const tree = program ? appTree(process.env, program) : undefined
if (tree !== undefined) registerHooks({ resolve: overlayResolve(tree) })
