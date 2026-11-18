/**
 * The examples gate (ACRYL spec 037's verified examples, for this app's plugin shape): each example is copied into a throwaway app's `plugins/`,
 * loaded by its folder name the way the app loads a row, mounted with the app's router and home page, and driven by its scenario. An example the
 * docs point at is one that works.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import * as router from 'acryl-router'
import { afterAll, describe, expect, it } from 'vitest'
import * as home from '../../../plugins/home/index.ts'
import { loadAppPlugins } from '../../../plugins/manifest/app-plugins.ts'

const pack = fileURLToPath(new URL('..', import.meta.url))
const STATES = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading']

interface Step {
  mount?: string
  remount?: string
  dispose?: string
  expect?: string
  request?: { method?: string; path: string; json?: unknown }
  status?: number
  contains?: string | string[]
  json?: unknown
  length?: number
  home?: { contains?: string[]; absent?: string[] }
}
const scenarios = JSON.parse(readFileSync(join(pack, 'example-plugins', 'scenarios.json'), 'utf8')) as { id: string; steps: Step[] }[]

// Inside the package, so the examples' `acrylblends` import resolves as it does in an app.
const scratch = join(pack, 'tests', '.apps')
mkdirSync(scratch, { recursive: true })
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('example plugins', () => {
  for (const scenario of scenarios) {
    it(scenario.id, async () => {
      const appRoot = mkdtempSync(join(scratch, `${scenario.id}-`))
      cpSync(join(pack, 'example-plugins', 'packages', scenario.id), join(appRoot, 'plugins', scenario.id), { recursive: true })
      const plugins = await loadAppPlugins(join(appRoot, 'plugins'), [scenario.id])
      const app = new Context()
      app.provide('appInstance', { root: appRoot, home: join(appRoot, '.acrylblends') })
      await app.plugin(router).await()
      await app.plugin(home).await()
      const services = app as unknown as { router: { request(path: string, init?: RequestInit): Promise<Response> }; home: home.Home }
      const fibers = new Map<string, Fiber>()
      const mount = async (id: string, state: string | undefined) => {
        const fiber = app.plugin(plugins[id] as { name: string; apply(ctx: Context): void })
        await fiber.await().catch(() => undefined)
        if (state !== undefined) expect(STATES[fiber.state as unknown as number], `${id} state`).toBe(state)
        fibers.set(id, fiber)
      }
      try {
        for (const step of scenario.steps) {
          if (step.mount !== undefined) await mount(step.mount, step.expect)
          else if (step.remount !== undefined) {
            await fibers.get(step.remount)?.dispose()
            await mount(step.remount, step.expect)
          } else if (step.dispose !== undefined) {
            await fibers.get(step.dispose)?.dispose()
            fibers.delete(step.dispose)
          } else if (step.request !== undefined) {
            const { method = 'GET', path, json } = step.request
            const response = await services.router.request(path, {
              method,
              ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } }),
            })
            const body = await response.text()
            if (step.status !== undefined) expect(response.status, `${method} ${path}: ${body}`).toBe(step.status)
            for (const text of [step.contains ?? []].flat()) expect(body).toContain(text)
            if (step.json !== undefined) expect(JSON.parse(body)).toEqual(step.json)
            if (step.length !== undefined) expect(JSON.parse(body)).toHaveLength(step.length)
          } else if (step.home !== undefined) {
            const page = await home.renderWidgets(services.home)
            for (const text of step.home.contains ?? []) expect(page).toContain(text)
            for (const text of step.home.absent ?? []) expect(page).not.toContain(text)
          } else throw new Error(`${scenario.id}: a step with no verb: ${JSON.stringify(step)}`)
        }
      } finally {
        for (const fiber of fibers.values()) await fiber.dispose()
      }
    })
  }
})
