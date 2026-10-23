/**
 * Mounting a plugin after startup from inside a Service method (what an Extensions service does). Inside a service method `this.ctx` is Cordis's
 * "shadow" context, which resolves services as the SERVICE'S OWN fiber; a child plugin mounted with it inherits that shadow, so its `ctx.router`
 * is looked up in the installer's fiber (which never injected it) and throws "cannot get property router without inject", even though the child's
 * own `fiber.inject` and `ctx.get('router')` are fine. The context captured in the constructor is not shadowed and mounts a plugin that behaves
 * exactly like one mounted at startup.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, name } from '../src/index.ts'

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

class Installer extends Service {
  private readonly owner: Context
  constructor(ctx: Context) {
    super(ctx, 'installer')
    this.owner = ctx
  }

  /** Right: mount from the context captured in the constructor. */
  async install(module: object): Promise<void> {
    await this.owner.plugin(module as never)
  }

  /** Wrong: `this.ctx` inside a method is the shadow context. */
  async installFromShadow(module: object): Promise<void> {
    await this.ctx.plugin(module as never)
  }
}

async function system(): Promise<Context & { installer: Installer }> {
  const root = new Context()
  contexts.push(root)
  root.plugin({ name, apply })
  root.plugin({ name: 'installer', apply: (ctx: Context) => { new Installer(ctx) } })
  await settle()
  return root as Context & { installer: Installer }
}

const extension = (): object => ({
  name: 'live-ext',
  inject: ['router'],
  apply(ctx: Context): void {
    ctx.router.get('/live', c => c.json({ ok: true }))
  },
})

describe('live install from a service method', () => {
  it('works from the constructor context: the plugin reads ctx.router like one mounted at startup', async () => {
    const root = await system()
    await root.installer.install(extension())
    expect(await (await root.router.request('/live')).json()).toEqual({ ok: true })
  })

  it('fails from this.ctx, which is Cordis behavior the framework docs warn about', async () => {
    const root = await system()
    await expect(root.installer.installFromShadow(extension())).rejects.toThrow(/cannot get property "router" without inject/u)
  })
})
