/**
 * A handler that reads `basePath(c)` (what `clientModules` does to cut its prefix off the request path) must see the same prefix whether its app is
 * mounted on the router directly or sits inside another app that is mounted there. Through the router the nested prefix was lost: `basePath(c)` was
 * `/`, so a nested `clientModules` answered 404 for every file (found in the create-acrylblends notes and chat templates, 2026-10-27).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { Acryl, apply, name } from '../src/index.ts'
import { basePath } from '../src/helpers/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function router(mount: (ctx: Context) => void): Promise<Context> {
  const root = new Context()
  contexts.push(root)
  root.plugin({ name, apply })
  root.plugin({ name: 'mount', inject: ['router'], apply: mount })
  await new Promise(resolve => setTimeout(resolve, 0))
  return root
}

const probe = (): Acryl => new Acryl().get('/*', c => c.text(`${basePath(c)}|${c.req.path.slice(basePath(c).length)}`))

describe('basePath(c) through the router', () => {
  it('is the mount path for an app mounted directly', async () => {
    const root = await router(ctx => { ctx.router.route('/direct', probe()) })
    expect(await (await root.router.request('/direct/a/b')).text()).toBe('/direct|/a/b')
  })

  it('is the whole prefix for an app nested in another app that is mounted on the router', async () => {
    const outer = new Acryl().route('/tools', probe())
    const root = await router(ctx => { ctx.router.route('/', outer) })
    expect(await (await root.router.request('/tools/a/b')).text()).toBe('/tools|/a/b')
  })

  it('adds the mount path to the nested prefix', async () => {
    const outer = new Acryl().route('/tools', probe())
    const root = await router(ctx => { ctx.router.route('/app', outer) })
    expect(await (await root.router.request('/app/tools/a/b')).text()).toBe('/app/tools|/a/b')
  })

  it('agrees with the core: the same nested app answers the same without the router', async () => {
    const outer = new Acryl().route('/tools', probe())
    expect(await (await outer.request('/tools/a/b')).text()).toBe('/tools|/a/b')
  })
})
