/**
 * The ACRYL inspector (`ctx.inspect`): what every running plugin requires, provides and registers, read from the live
 * registry. It owns no state and registers nothing of its own beyond an optional read-only pair of router routes, which are
 * reachable in process unless some plugin mounts their prefix over HTTP.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { loopbackOnly } from 'acryl-router/middleware'
import type {} from 'acryl-router'
import { explain, ownerOf, renderReports, reportFiber, type FiberView, type PluginReport } from './report.ts'

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
    const fibers = [...this.ctx.registry.values()].flatMap(runtime => [...runtime.fibers] as unknown as FiberView[])
    // An unnamed inline callback is part of the plugin that wrote it: its routes and mounts are that plugin's.
    const adopted = new Map<FiberView, FiberView[]>()
    const owners: FiberView[] = []
    for (const fiber of fibers) {
      const owner = ownerOf(fiber)
      if (owner === fiber) owners.push(fiber)
      else adopted.set(owner, [...(adopted.get(owner) ?? []), fiber])
    }
    return owners.map(fiber => reportFiber(fiber, adopted.get(fiber) ?? []))
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
  // The same facts on the router, for any surface; present only where a router is. A request over a socket must come from this machine to this app;
  // the terminal calls the router in process and is the host's own code.
  ctx.inject(['router'], inner => {
    const api = inner.router.group('/api/inspect', loopbackOnly({ inProcess: 'allow' }))
    api.get('/plugins', c => c.json(inspect.plugins()))
    api.get('/plugins/:name', c => {
      const text = inspect.explain(c.param('name') ?? '')
      return text === undefined ? c.json({ error: 'no such plugin' }, 404) : c.text(text)
    })
    // Over HTTP only where an adapter exists (Web and Desktop); the terminal needs none.
    inner.inject(['routerHttp'], http => { http.routerHttp.mount('/api/inspect') })
  })
}
