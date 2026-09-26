/**
 * The renderer-facing view of the shared plugin lifecycle.
 *
 * The lifecycle itself (resolution, dependent cascade, transactions, rollback, Fiber restart, persistence)
 * is the one controller behind `ctx.acrPluginLifecycle` that every surface publishes. This adds only what
 * the Settings tab needs on top: whether each entry also has a browser face and whether that face is in the
 * page's boot graph, the Blend identity of the running composition when the surface has one, and the fact
 * that a mutation needs the page to reload to re-compose its client graph.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-modules'
import type {
  AcrPluginLifecycle,
  PluginLifecycleReceipt as SharedReceipt,
} from 'acryl-harness-runtime'
import type {
  PluginLifecycleBlendView,
  PluginLifecycleEntryView,
  PluginLifecycleReceipt,
  PluginLifecycleSnapshot,
} from './contract.ts'
import type { PluginLifecycleRouteController } from './route.ts'

/** The Blend a surface composed, when it has one (Desktop's launcher projects it; Web has none). */
export interface PluginLifecycleBlendSource {
  readonly origin: {
    readonly id: string
    readonly kind: 'Blueprint' | 'Blend'
    readonly version: string
    readonly digest: string
  }
  readonly lockPath: string
  readonly rows: readonly unknown[]
}

interface PackageManifest {
  readonly name?: unknown
  readonly exports?: unknown
  readonly dsh?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function declaresClientFace(manifest: PackageManifest, moduleName: string): boolean {
  if (manifest.name !== moduleName || !isRecord(manifest.dsh)) return false
  const client = manifest.dsh.client
  if (!isRecord(client) || client.platform !== 'web') return false
  if (!isRecord(manifest.exports)) return false
  return Object.prototype.hasOwnProperty.call(manifest.exports, './client')
}

export class PluginLifecycleView implements PluginLifecycleRouteController {
  private readonly clientFaces = new Map<string, boolean>()
  private readonly resolvePackageJson: ((specifier: string) => string) | undefined

  /**
   * @param ctx - the Host context, read for the client module graph and the base URL packages resolve from.
   * @param lifecycle - the surface's `ctx.acrPluginLifecycle` authority.
   * @param blend - reads the composed Blend, or `undefined` on a surface without one.
   */
  constructor(
    private readonly ctx: Context,
    private readonly lifecycle: AcrPluginLifecycle,
    private readonly blend: () => PluginLifecycleBlendSource | undefined = () => undefined,
  ) {
    const require = ctx.baseUrl === undefined ? undefined : createRequire(ctx.baseUrl)
    this.resolvePackageJson = require === undefined
      ? undefined
      : specifier => require.resolve(`${specifier}/package.json`)
  }

  /** Every non-group Host entry with its current client-graph membership. */
  snapshot(): PluginLifecycleSnapshot {
    const graph = this.ctx.get('clientModules')?.graph()
    const clientGraph = new Set(graph?.entries.map(entry => entry.id) ?? [])
    const entries: PluginLifecycleEntryView[] = this.lifecycle.snapshot().entries.map((entry) => {
      const clientPackage = this.clientPackage(entry.moduleName, clientGraph)
      return Object.freeze({
        ...entry,
        clientPackage,
        clientInBootGraph: clientPackage !== null && clientGraph.has(clientPackage),
      })
    })
    return Object.freeze({ entries: Object.freeze(entries), blend: this.blendView() })
  }

  /** Persist and apply one managed entry's enablement, dependents included. */
  async setEnabled(entryId: string, enabled: boolean): Promise<PluginLifecycleReceipt> {
    return this.receipt(await this.lifecycle.setEnabled(entryId, enabled))
  }

  /** Restart one entry, or every enabled entry the surface's lifecycle sweeps. */
  async reload(entryId?: string): Promise<PluginLifecycleReceipt> {
    return this.receipt(await this.lifecycle.reload(entryId))
  }

  private blendView(): PluginLifecycleBlendView | null {
    const blend = this.blend()
    if (blend === undefined) return null
    return Object.freeze({
      id: blend.origin.id,
      kind: blend.origin.kind,
      version: blend.origin.version,
      digest: blend.origin.digest,
      lockPath: blend.lockPath,
      rows: blend.rows.length,
    })
  }

  private clientPackage(moduleName: string, graph: ReadonlySet<string>): string | null {
    if (graph.has(moduleName)) return moduleName
    const cached = this.clientFaces.get(moduleName)
    if (cached !== undefined) return cached ? moduleName : null
    let declared = false
    if (!moduleName.startsWith('cordis:') && this.resolvePackageJson !== undefined) {
      try {
        const manifest = JSON.parse(readFileSync(this.resolvePackageJson(moduleName), 'utf8')) as PackageManifest
        declared = declaresClientFace(manifest, moduleName)
      } catch {
        declared = false
      }
    }
    this.clientFaces.set(moduleName, declared)
    return declared ? moduleName : null
  }

  /** The Host fiber already restarted; the page must reload to re-compose its client graph. */
  receipt(receipt: SharedReceipt): PluginLifecycleReceipt {
    return Object.freeze({
      ...receipt,
      rendererReloadRequired: true,
      snapshot: this.snapshot(),
    })
  }
}
