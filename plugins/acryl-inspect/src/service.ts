/**
 * The ACRYL inspector (`ctx.inspect`): what every running plugin requires, provides and registers, read from the live
 * registry. It owns no state and registers nothing of its own beyond an optional read-only pair of router routes, which are
 * reachable in process unless some plugin mounts their prefix over HTTP.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {} from 'acryl-router'
import { explain, renderReports, reportFiber, type FiberView, type PluginReport } from './report.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    inspect: Inspect
  }
}

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-inspect'

export class Inspect extends Service {
  constructor(ctx: Context) {
    super(ctx, 'inspect')
  }

  /** A report for every live plugin instance, in registry order. */
  plugins(): PluginReport[] {
    const reports: PluginReport[] = []
    for (const runtime of this.ctx.registry.values()) {
      for (const fiber of runtime.fibers) reports.push(reportFiber(fiber as unknown as FiberView))
    }
    return reports
  }

  /** The text explanation of the plugin called `pluginName`, or `undefined` when none is registered. */
  explain(pluginName: string): string | undefined {
    const found = this.plugins().filter(report => report.name === pluginName)
    return found.length === 0 ? undefined : found.map(explain).join('\n\n')
  }

  /** The whole system as text. */
  render(): string {
    return renderReports(this.plugins())
  }
}

export function apply(ctx: Context): void {
  const inspect = new Inspect(ctx)
  // The same facts on the router, for any surface; present only where a router is.
  ctx.inject(['router'], inner => {
    inner.router.get('/api/inspect/plugins', c => c.json(inspect.plugins()))
    inner.router.get('/api/inspect/plugins/:name', c => {
      const text = inspect.explain(c.params['name'] ?? '')
      return text === undefined ? c.json({ error: 'no such plugin' }, 404) : c.text(text)
    })
  })
}
