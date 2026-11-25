/**
 * The Control Center's service wired to this machine: real processes, the running apps' doors, the public registry, and the tools fetch. One wiring for
 * every face that runs the Control Center in a Node process: the Cordis Host plugin (index.ts) and the terminal Control Center (`acryl`, bundled from
 * distribution/acryl-npm-launcher/tui), so the window, the browser and the terminal do the same thing with the same code.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { prepareTools } from '@acryldev/launcher'
import { fileDoor } from './door.ts'
import { readBlends, readPluginCatalog } from './registry.ts'
import { spawnRunner } from './runner.ts'
import { nodeSelfFiles } from './self-update.ts'
import { LauncherService } from './service.ts'

/** `home` is ACRYL's home (`~/.acryl`); new apps are suggested in the visible folder beside it (`~/ACRYL`): the home's parent, never a looked-up user folder. */
/** The copy of a Blend this Control Center runs from (`~/.acryl/control-center`): it then offers that Blend's newer releases for itself. */
export interface NodeSelf {
  readonly folder: string
  readonly name: string
}

export function createNodeLauncher(home: string, environment: () => Readonly<Record<string, string | undefined>> = () => process.env, self?: NodeSelf): LauncherService {
  return new LauncherService({
    home,
    appsFolder: join(dirname(home), 'ACRYL'),
    runner: spawnRunner,
    environment,
    exists: path => existsSync(path),
    makeFolder: (path) => { mkdirSync(path, { recursive: true }) },
    blends: () => readBlends(),
    pluginCatalog: () => readPluginCatalog(),
    door: fileDoor(),
    // A computer without Node.js 22.19+ or gh gets them once, from their makers, into the home's tools folder.
    prepareTools: () => prepareTools(home, process.env),
    ...self === undefined ? {} : { self: { ...self, files: nodeSelfFiles, startedAt: Date.now() - process.uptime() * 1000 } },
  })
}

export { LauncherRefusal, LauncherService } from './service.ts'
export { readBlends, readPluginCatalog, RegistryUnavailable } from './registry.ts'
export { webboxesDeployUrl } from './contract.ts'
export type { AppView, BlendView, PluginCatalogEntry, PluginCatalogView, GithubPollView, GithubStartView, JobView, PluginView, StateResponse, Surface } from './contract.ts'
// The door client over an app folder's `.acryl/door.json`: what another Blend (ACRYL AOS) uses to drive the apps this service starts.
export { type Door, type DoorAnswer, DoorUnavailable, fileDoor } from './door.ts'
