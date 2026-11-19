/*
 * Ported from DeepSeek Harness, packages/boot/app-boot/src/profile-resolution/service.ts at dsh-v0.2.0-rc.2 (639ed01539, MIT,
 * Copyright (c) 2026 DeepSeek; see THIRD_PARTY_NOTICES.md). Deviation: the class extends the original `PluginPackages`, so every
 * consumer of the `pluginPackages` service (the plugin inventories, the plugin manager, the typert loader) keeps its type and its
 * inherited `metaOf`, and constructs it with no resolution, so the original installs nothing; the interception is the port's in
 * ./resolver.ts, which needs no native add-on. Second deviation: a resolve hook registered after the interception names what replaces a
 * framework import from before the framework moved to acrylblends (./moved-framework.ts), and is deregistered with it.
 */

/** Package metadata resolved through one runtime interception. */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { PluginPackages, type PluginPackage, type PluginPackagesConfig, type RuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { registerMovedFrameworkImports } from './moved-framework.ts'
import {
  barePackageName,
  installRuntimeInterception,
  registerWorkerResolution,
  type RuntimeInterception,
} from './resolver.ts'

function readPackage(dir: string, fallbackName: string): PluginPackage | undefined {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return undefined
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  const name = manifest.name
  const version = manifest.version
  return {
    name: typeof name === 'string' ? name : fallbackName,
    version: typeof version === 'string' ? version : undefined,
    dir,
    manifestPath,
    manifest,
  }
}

/** Package lookup shared by metadata consumers in one profile process, on Node's public module hooks. */
export class ProfilePluginPackages extends PluginPackages {
  private table = new Map<string, PluginPackage | undefined>()
  private readonly routing: RuntimeInterception | undefined
  private disposeWorkers: (() => void) | undefined

  constructor(ctx: Context, config: PluginPackagesConfig = {}) {
    super(ctx, {})
    if (config.resolution === undefined) return
    const interception = installRuntimeInterception(config.resolution)
    this.disposeWorkers = registerWorkerResolution(config.resolution)
    this.routing = interception
    // Registered after the interception, so an old framework import that the profile cannot resolve fails with what replaces it.
    const movedImports = registerMovedFrameworkImports()
    ctx.effect(() => () => {
      movedImports.deregister()
      this.disposeWorkers?.()
      interception.dispose()
    }, 'profile package resolution')
  }

  /**
   * Publish a complete successor generation for this process and subsequently created Workers.
   * Linked roots may be removed without unloading modules or clearing Node caches.
   * @param successor - fully constructed generation accepted by {@link RuntimeInterception.replace}.
   */
  override replace(successor: RuntimeResolution): void {
    if (this.routing === undefined) throw new Error('plugin-packages: runtime resolution is not installed')
    this.routing.replace(successor)
    this.table = new Map()
    this.disposeWorkers?.()
    this.disposeWorkers = registerWorkerResolution(successor)
  }

  /**
   * Locate the package named by a specifier without requiring a package export.
   * @param specifier - module specifier whose package owns the requested module.
   * @param parentURL - URL whose Node lookup order applies.
   * @returns the parsed package, or undefined when no package owns the request.
   */
  override packageOf(specifier: string, parentURL: string): PluginPackage | undefined {
    const name = barePackageName(specifier)
    if (name === undefined) return undefined
    const dir = this.routing === undefined
      ? packageDirFromParent(name, parentURL)
      : this.routing.packageDir(name, parentURL)
    if (dir === undefined) return undefined
    const key = JSON.stringify({ dir, name })
    if (!this.table.has(key)) this.table.set(key, readPackage(dir, name))
    return this.table.get(key)
  }
}

function packageDirFromParent(name: string, parentURL: string): string | undefined {
  for (const searchPath of createRequire(parentURL).resolve.paths(name) as string[]) {
    const candidate = join(searchPath, name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}
