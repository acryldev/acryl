// @vitest-environment jsdom
// The Module Loader registry first: the renderer bundle imported by advanced-shell.ts registers with it as the page would.
import { moduleOf } from './support/module-loader.ts'
import type { SlotRegistry as SlotRegistryService } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { Context, type FiberState } from '@deepseek-ai/cordis'
import Loader, { Group } from '@deepseek-ai/cordis-plugin-loader'
import { describe, expect, it } from 'vitest'
import { applyAdvancedShell } from '../src/client/advanced-shell.ts'

const { SlotRegistry } = moduleOf('@deepseek-ai/dsh-client-ui-renderer') as { SlotRegistry: typeof SlotRegistryService }

// The runtime seat toggle, under the real Loader and the real slot registry, with DSH's left sidebar played by a stand-in that declares
// `sidebar.settings` from its own registration the way the real one does.

const ACTIVE = 2 as FiberState
const Stub = () => null

/** DSH's left sidebar as its slot side behaves: it declares the seat only while its own registration is mounted. */
const sidebarStandIn = {
  name: 'dsh-sidebar-stand-in',
  inject: ['slots', 'sidebarReady'],
  apply(ctx: Context & { slots: SlotRegistryService }) {
    ctx.slots.inject('sidebar', () => ctx.slots.register({
      name: 'sidebar',
      children: { 'sidebar.settings': { kind: 'single', scope: 'root' } },
    }, Stub as never))
  },
}

/** DSH's Settings plugin as far as the seat cares: it declares `settings.launcher`, where the seat's launcher registers. */
const settingsStandIn = {
  name: 'dsh-settings-stand-in',
  inject: ['slots'],
  apply(ctx: Context & { slots: SlotRegistryService }) {
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-settings-stand-in',
      children: { 'settings.launcher': { kind: 'single', scope: 'root' } },
    }, Stub as never))
  },
}

/** DSH's two packages by the module specifiers an entry names them by. */
const SIDEBAR = '@deepseek-ai/dsh-client-ui-sidebar'
const SETTINGS = '@deepseek-ai/dsh-client-ui-settings-general'

interface Program {
  readonly ctx: Context
  readonly loader: Loader
  applyShell: () => void
  sidebarFiber: () => FiberState | undefined
  seatDeclared: () => boolean
  triggerRows: () => number
  settle: () => Promise<void>
}

/** A client program: the real slot registry and services, the loader, and the root shell applied when a test says so. */
async function program(options: { loader?: boolean } = {}): Promise<Program> {
  const ctx = new Context()
  const slots = new SlotRegistry(ctx)
  ctx.provide('theme' as never, { getTheme: () => ({ active: { colorScheme: 'light', tokens: {} } }) } as never)
  let loader: Loader | undefined
  if (options.loader !== false) {
    await ctx.plugin(Loader, { baseUrl: 'file:///' })
    loader = ctx.loader
    loader.builtins.group = Group
    // The stand-ins load where the named packages would; the entries keep the real package names the seat decision reads.
    loader.import = (async (name: string) => {
      if (name === SIDEBAR) return sidebarStandIn
      if (name === SETTINGS) return settingsStandIn
      if (name === 'cordis:group') return Group
      throw new Error(`no module ${name}`)
    }) as never
  }
  const settle = async () => {
    for (let round = 0; round < 4; round += 1) {
      await loader?.await().catch(() => {})
      await new Promise(resolve => { setTimeout(resolve, 10) })
    }
  }
  return {
    ctx,
    loader: loader as Loader,
    applyShell: () => {
      ctx.plugin({
        name: 'root-shell',
        apply: inner => { applyAdvancedShell(inner as never, { mode: 'advanced', platform: 'darwin' }) },
      })
    },
    sidebarFiber: () => [...loader!.entries()].find(entry => entry.options.name === SIDEBAR)?.fiber?.state as FiberState | undefined,
    seatDeclared: () => slots.spec('sidebar.settings') !== undefined,
    triggerRows: () => slots.entries('settings.launcher').length,
    settle,
  }
}

describe('the settings seat under a real Loader', () => {
  it('owns the seat by default when no loader is composed', async () => {
    const mounted = await program({ loader: false })
    mounted.applyShell()
    await mounted.settle()
    expect(mounted.seatDeclared()).toBe(true)
  })

  it('does not own the seat when DSH\'s sidebar is composed, even before that entry activates', async () => {
    const mounted = await program()
    // Enabled, but its service is not there yet: the entry exists while its fiber cannot start (the boot order that broke the old decision).
    await mounted.loader.create({ name: SIDEBAR })
    await mounted.loader.create({ name: SETTINGS })
    mounted.applyShell()
    await mounted.settle()
    expect(mounted.sidebarFiber()).not.toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(false)
    // The sidebar activates and declares the seat itself: one declaration, no failure.
    mounted.ctx.provide('sidebarReady' as never, {} as never)
    await mounted.settle()
    expect(mounted.sidebarFiber()).toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(0)
  })

  it('owns the seat when DSH\'s sidebar is disabled at boot', async () => {
    const mounted = await program()
    await mounted.loader.create({ name: SIDEBAR, disabled: true })
    await mounted.loader.create({ name: SETTINGS })
    mounted.ctx.provide('sidebarReady' as never, {} as never)
    mounted.applyShell()
    await mounted.settle()
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(1)
  })

  it('follows the sidebar toggled at runtime both ways: Settings stays reachable, no duplicate declaration', async () => {
    const mounted = await program()
    const sidebar = await mounted.loader.create({ name: SIDEBAR, disabled: true })
    await mounted.loader.create({ name: SETTINGS })
    mounted.ctx.provide('sidebarReady' as never, {} as never)
    mounted.applyShell()
    await mounted.settle()
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(1)

    // Enabled while the root owns the seat: the root drops it before the sidebar declares its own.
    await mounted.loader.update(sidebar, { disabled: false })
    await mounted.settle()
    expect(mounted.sidebarFiber()).toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(0)

    // Disabled again: the seat and its launcher come back, so Settings stays reachable without a reload.
    await mounted.loader.update(sidebar, { disabled: true })
    await mounted.settle()
    expect(mounted.sidebarFiber()).not.toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(1)

    // And once more enabled: still no duplicate declaration, the sidebar activates.
    await mounted.loader.update(sidebar, { disabled: false })
    await mounted.settle()
    expect(mounted.sidebarFiber()).toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(0)
  })

  it('follows a sidebar disabled and enabled through its parent group', async () => {
    const mounted = await program()
    const group = await mounted.loader.create({
      name: 'cordis:group',
      group: true,
      config: [{ id: 'sidebar', name: SIDEBAR }],
    })
    await mounted.loader.create({ name: SETTINGS })
    mounted.ctx.provide('sidebarReady' as never, {} as never)
    mounted.applyShell()
    await mounted.settle()
    expect(mounted.sidebarFiber()).toBe(ACTIVE)
    expect(mounted.triggerRows()).toBe(0)

    await mounted.loader.update(group, { disabled: true })
    await mounted.settle()
    expect(mounted.sidebarFiber()).not.toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(1)

    await mounted.loader.update(group, { disabled: false })
    await mounted.settle()
    expect(mounted.sidebarFiber()).toBe(ACTIVE)
    expect(mounted.seatDeclared()).toBe(true)
    expect(mounted.triggerRows()).toBe(0)
  })
})
