import { describe, expect, it, vi } from 'vitest'
import type { DesktopMarketSnapshot } from '../../src/plugins/desktop-market.ts'
import DesktopSettingsController, {
  type DesktopSettingsControllerBootstrap,
} from '../../src/settings/desktop-settings-controller.ts'
import {
  DESKTOP_DIAGNOSTICS_EXPORT_PATH,
  DESKTOP_MARKET_SELECT_PATH,
  DESKTOP_PROFILE_CREATE_PATH,
  DESKTOP_PROFILE_CREATE_WINDOW_PATH,
  DESKTOP_PROFILE_DELETE_PATH,
  DESKTOP_PROFILE_ROLLBACK_PATH,
  DESKTOP_PROFILE_SELECT_PATH,
  DESKTOP_SETTINGS_PATH,
  DESKTOP_TERMINAL_OPEN_PATH,
} from '../../src/settings/desktop-settings-contract.ts'
import { desktopSettingsRouteConstants, desktopSettingsRoutes } from '../../src/settings/desktop-settings-route.ts'
import type { DesktopProfileSummary } from '../../src/profile/profile-manager.ts'
import { call, ORIGIN, postJson } from '../api/call.ts'

const DESKTOP: DesktopProfileSummary = {
  name: 'desktop',
  dir: '/private/profiles/desktop',
  exists: true,
  bundles: ['@deepseek-ai/dsh-web-app'],
  webCapable: true,
}

const WORK: DesktopProfileSummary = {
  name: 'work',
  dir: '/private/profiles/work',
  exists: true,
  bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  webCapable: true,
}

const BROKEN: DesktopProfileSummary = {
  name: 'broken',
  dir: '/private/profiles/broken',
  exists: true,
  bundles: ['private-bundle'],
  webCapable: false,
  problem: 'failed to read /private/profiles/broken/package.json',
}

function market(
  requested: DesktopMarketSnapshot['requested'] = 'disabled',
  effective: DesktopMarketSnapshot['effective'] = requested,
  legacyDefaulted = false,
): DesktopMarketSnapshot {
  return { requested, effective, legacyDefaulted }
}

function bootstrap(
  overrides: Partial<DesktopSettingsControllerBootstrap> = {},
): DesktopSettingsControllerBootstrap {
  return {
    profiles: {
      current: { name: DESKTOP.name, dir: DESKTOP.dir },
      list: () => [DESKTOP, WORK, BROKEN],
      create: () => WORK,
      canDelete: () => false,
      delete: async () => {},
    },
    persistProfileSelection: async () => {},
    readMarket: () => market(),
    selectMarket: async provider => market(provider),
    scheduleRestart: () => {},
    openTerminal: () => {},
    exportDiagnostics: async () => {},
    openProfileCreator: () => {},
    prepareProfileRollback: () => ({
      response: { accepted: true, restartRequired: true, targetProfile: 'desktop' },
    }),
    ...overrides,
  }
}

describe('desktop settings controller', () => {
  it('projects profiles without paths, bundles, or parser diagnostics', () => {
    const controller = new DesktopSettingsController(bootstrap())

    expect(controller.read()).toEqual({
      current: 'desktop',
      profiles: [
        { name: 'desktop', exists: true, webCapable: true, selectable: true, deletable: false },
        { name: 'work', exists: true, webCapable: true, selectable: true, deletable: false },
        { name: 'broken', exists: true, webCapable: false, selectable: false, deletable: false },
      ],
      market: { requested: 'disabled', effective: 'disabled', legacyDefaulted: false },
    })
    expect(JSON.stringify(controller.read())).not.toContain('/private')
    expect(JSON.stringify(controller.read())).not.toContain('private-bundle')
  })

  it('creates without selecting or restarting and returns a fresh safe state', () => {
    const create = vi.fn(() => WORK)
    const persistProfileSelection = vi.fn(async () => {})
    const scheduleRestart = vi.fn()
    const controller = new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [DESKTOP, WORK],
        create,
      },
      persistProfileSelection,
      scheduleRestart,
    }))

    expect(controller.createProfile('work')).toEqual({
      current: 'desktop',
      profiles: [
        { name: 'desktop', exists: true, webCapable: true, selectable: true, deletable: false },
        { name: 'work', exists: true, webCapable: true, selectable: true, deletable: false },
      ],
      market: { requested: 'disabled', effective: 'disabled', legacyDefaulted: false },
    })
    expect(create).toHaveBeenCalledWith('work')
    expect(persistProfileSelection).not.toHaveBeenCalled()
    expect(scheduleRestart).not.toHaveBeenCalled()
  })

  it('deletes an eligible profile and returns the fresh projection', async () => {
    const remove = vi.fn(async () => {})
    const controller = new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [DESKTOP, WORK],
        create: () => WORK,
        canDelete: name => name === WORK.name,
        delete: remove,
      },
    }))

    await expect(controller.deleteProfile('work')).resolves.toEqual({
      current: 'desktop',
      profiles: [
        { name: 'desktop', exists: true, webCapable: true, selectable: true, deletable: false },
        { name: 'work', exists: true, webCapable: true, selectable: true, deletable: true },
      ],
      market: { requested: 'disabled', effective: 'disabled', legacyDefaulted: false },
    })
    expect(remove).toHaveBeenCalledWith('work')
  })

  it('persists a fresh selectable profile and defers restart until after response', async () => {
    const persistProfileSelection = vi.fn(async () => {})
    const scheduleRestart = vi.fn()
    const controller = new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [DESKTOP, WORK, BROKEN],
        create: () => WORK,
      },
      persistProfileSelection,
      scheduleRestart,
    }))

    await expect(controller.selectProfile('desktop')).resolves.toEqual({
      response: { accepted: true, restartRequired: false },
    })
    const operation = await controller.selectProfile('work')
    expect(operation.response).toEqual({ accepted: true, restartRequired: true })
    expect(persistProfileSelection).toHaveBeenCalledOnce()
    expect(persistProfileSelection).toHaveBeenCalledWith('work')
    expect(scheduleRestart).not.toHaveBeenCalled()
    operation.afterResponse?.()
    expect(scheduleRestart).toHaveBeenCalledOnce()
    await expect(controller.selectProfile('broken')).rejects.toThrow('is not selectable')
  })

  it('keeps the generation-effective Market fixed and schedules only after persistence', async () => {
    const events: string[] = []
    const selectMarket = vi.fn(async (provider: DesktopMarketSnapshot['requested']) => {
      events.push(`persist:${provider}`)
      return market(provider, provider, false)
    })
    const scheduleRestart = vi.fn(() => { events.push('schedule') })
    const controller = new DesktopSettingsController(bootstrap({
      readMarket: () => market('community-market'),
      selectMarket,
      scheduleRestart,
    }))

    const operation = await controller.selectMarket('dsh-market')
    expect(operation.response).toEqual({ accepted: true, restartRequired: true })
    expect(events).toEqual(['persist:dsh-market'])
    operation.afterResponse?.()
    expect(events).toEqual(['persist:dsh-market', 'schedule'])
  })

  it('persists an explicit legacy-default choice without restarting the same provider', async () => {
    const scheduleRestart = vi.fn()
    const controller = new DesktopSettingsController(bootstrap({
      readMarket: () => market('disabled', 'disabled', true),
      selectMarket: async provider => market(provider, provider, false),
      scheduleRestart,
    }))

    await expect(controller.selectMarket('disabled')).resolves.toEqual({
      response: { accepted: true, restartRequired: false },
    })
    expect(scheduleRestart).not.toHaveBeenCalled()
  })

  it('does not expose a restart callback when persistence fails', async () => {
    const scheduleRestart = vi.fn()
    const controller = new DesktopSettingsController(bootstrap({
      persistProfileSelection: async () => { throw new Error('state is read-only') },
      selectMarket: async () => { throw new Error('state is read-only') },
      scheduleRestart,
    }))

    await expect(controller.selectProfile('work')).rejects.toThrow('state is read-only')
    await expect(controller.selectMarket('community-market')).rejects.toThrow('state is read-only')
    expect(scheduleRestart).not.toHaveBeenCalled()
  })

  it('opens the launcher-owned terminal and returns a stable acceptance', () => {
    const openTerminal = vi.fn()
    const controller = new DesktopSettingsController(bootstrap({ openTerminal }))

    expect(controller.openTerminal()).toEqual({ accepted: true })
    expect(openTerminal).toHaveBeenCalledOnce()
  })

  it('hands native diagnostics, Profile creation, and rollback to launcher capabilities', async () => {
    const exportDiagnostics = vi.fn(async () => {})
    const openProfileCreator = vi.fn()
    const afterResponse = vi.fn()
    const prepareProfileRollback = vi.fn(() => ({
      response: { accepted: true as const, restartRequired: true as const, targetProfile: 'desktop' },
      afterResponse,
    }))
    const controller = new DesktopSettingsController(bootstrap({
      exportDiagnostics,
      openProfileCreator,
      prepareProfileRollback,
    }))

    await expect(controller.exportDiagnostics()).resolves.toEqual({ accepted: true })
    expect(controller.openProfileCreator()).toEqual({ accepted: true })
    expect(controller.rollbackProfile()).toEqual({
      response: { accepted: true, restartRequired: true, targetProfile: 'desktop' },
      afterResponse,
    })
    expect(exportDiagnostics).toHaveBeenCalledOnce()
    expect(openProfileCreator).toHaveBeenCalledOnce()
    expect(prepareProfileRollback).toHaveBeenCalledOnce()
  })
})

const nextTurn = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve) })

describe('desktop settings HTTP boundary', () => {
  it('serves GET state with no-store headers and supports browser GET fetch metadata', async () => {
    const controller = new DesktopSettingsController(bootstrap())

    const res = await call(desktopSettingsRoutes(controller), DESKTOP_SETTINGS_PATH, {
      headers: { origin: undefined, referer: `${ORIGIN}/settings` },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(controller.read())
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it.each([
    ['cross-origin', { headers: { origin: 'https://example.com' } }],
    ['wrong Host', { headers: { host: 'example.com', origin: ORIGIN } }],
    ['non-loopback socket', { remoteAddress: '192.0.2.10' }],
    ['cross-site metadata', { headers: { 'sec-fetch-site': 'cross-site' } }],
  ] as const)('rejects a %s request before reading settings', async (_label, options) => {
    const readMarket = vi.fn(() => market())
    const controller = new DesktopSettingsController(bootstrap({ readMarket }))
    readMarket.mockClear()

    const res = await call(desktopSettingsRoutes(controller), DESKTOP_SETTINGS_PATH, options)

    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(readMarket).not.toHaveBeenCalled()
  })

  it('creates a profile from an exact bounded JSON body', async () => {
    const create = vi.fn(() => WORK)
    const controller = new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [DESKTOP, WORK],
        create,
      },
    }))

    const res = await postJson(desktopSettingsRoutes(controller), DESKTOP_PROFILE_CREATE_PATH, { name: 'work' })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      current: 'desktop',
      profiles: [
        { name: 'desktop', exists: true, webCapable: true, selectable: true, deletable: false },
        { name: 'work', exists: true, webCapable: true, selectable: true, deletable: false },
      ],
      market: { requested: 'disabled', effective: 'disabled', legacyDefaulted: false },
    })
    expect(create).toHaveBeenCalledWith('work')
  })

  it('deletes a profile through the exact mutation endpoint', async () => {
    const remove = vi.fn(async () => {})
    const controller = new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [DESKTOP, WORK],
        create: () => WORK,
        canDelete: name => name === WORK.name,
        delete: remove,
      },
    }))

    const res = await postJson(desktopSettingsRoutes(controller), DESKTOP_PROFILE_DELETE_PATH, { name: 'work' })

    expect(res.status).toBe(200)
    expect(remove).toHaveBeenCalledWith('work')
    expect((await res.json() as { profiles: unknown }).profiles).toEqual([
      { name: 'desktop', exists: true, webCapable: true, selectable: true, deletable: false },
      { name: 'work', exists: true, webCapable: true, selectable: true, deletable: true },
    ])
  })

  it.each([
    [{}, 400],
    [{ name: '' }, 400],
    [{ name: '../escape' }, 400],
    [{ name: 'work', extra: true }, 400],
    [{ provider: 'unknown' }, 400],
    [{ provider: 'disabled', extra: true }, 400],
  ])('rejects a non-exact or invalid mutation body', async (body, statusCode) => {
    const create = vi.fn(() => WORK)
    const selectMarket = vi.fn(async () => market())
    const controller = new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [],
        create,
      },
      selectMarket,
    }))

    const res = await postJson(desktopSettingsRoutes(controller), 'provider' in body ? DESKTOP_MARKET_SELECT_PATH : DESKTOP_PROFILE_CREATE_PATH, body)

    expect(res.status).toBe(statusCode)
    expect(create).not.toHaveBeenCalled()
    expect(selectMarket).not.toHaveBeenCalled()
  })

  it('rejects unsupported media types, malformed JSON, and declared or streamed oversized bodies', async () => {
    const create = vi.fn(() => WORK)
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      profiles: { current: { name: DESKTOP.name, dir: DESKTOP.dir }, list: () => [], create },
    })))
    const post = (body: BodyInit, headers: Record<string, string>): Promise<Response> =>
      call(routes, DESKTOP_PROFILE_CREATE_PATH, { method: 'POST', body, headers })

    const wrongType = await post('{}', { 'content-type': 'text/plain' })
    expect(wrongType.status).toBe(415)
    expect(await wrongType.json()).toEqual({ error: 'content type must be application/json' })

    const malformed = await post('{', { 'content-type': 'application/json' })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({ error: 'invalid JSON request' })

    const declared = await post('{}', {
      'content-type': 'application/json',
      'content-length': String(desktopSettingsRouteConstants.maxBodyBytes + 1),
    })
    expect(declared.status).toBe(413)

    const oversized = new Uint8Array(desktopSettingsRouteConstants.maxBodyBytes + 1).fill(0x20)
    const streamed = await post(new ReadableStream({ start(controller) { controller.enqueue(oversized); controller.close() } }), { 'content-type': 'application/json' })
    expect(streamed.status).toBe(413)
    expect(await streamed.json()).toEqual({ error: 'request body is too large' })
    expect(create).not.toHaveBeenCalled()
  })

  it('selects a profile and persists a Market provider, and restarts only after each answer has gone out', async () => {
    const persistProfileSelection = vi.fn(async () => {})
    const selectMarket = vi.fn(async () => market('community-market'))
    const scheduleRestart = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [DESKTOP, WORK],
        create: () => WORK,
      },
      persistProfileSelection,
      selectMarket,
      scheduleRestart,
    })))

    const profileResponse = await postJson(routes, DESKTOP_PROFILE_SELECT_PATH, { name: 'work' })
    const marketResponse = await postJson(routes, DESKTOP_MARKET_SELECT_PATH, { provider: 'community-market' })

    expect(profileResponse.status).toBe(202)
    expect(marketResponse.status).toBe(202)
    expect(persistProfileSelection).toHaveBeenCalledWith('work')
    expect(selectMarket).toHaveBeenCalledWith('community-market')
    await nextTurn()
    // Neither answer has been read yet, so neither restart has started.
    expect(scheduleRestart).not.toHaveBeenCalled()
    expect(await profileResponse.json()).toEqual({ accepted: true, restartRequired: true })
    expect(await marketResponse.json()).toEqual({ accepted: true, restartRequired: true })
    await nextTurn()
    expect(scheduleRestart).toHaveBeenCalledTimes(2)
  })

  it('still restarts when the client goes away before reading the answer', async () => {
    const afterResponse = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      prepareProfileRollback: () => ({
        response: { accepted: true, restartRequired: true, targetProfile: 'desktop' },
        afterResponse,
      }),
    })))

    const res = await postJson(routes, DESKTOP_PROFILE_ROLLBACK_PATH, {})
    await res.body?.cancel()
    await nextTurn()

    expect(afterResponse).toHaveBeenCalledOnce()
  })

  it('opens the terminal only for an exact same-origin empty request', async () => {
    const openTerminal = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({ openTerminal })))

    const accepted = await postJson(routes, DESKTOP_TERMINAL_OPEN_PATH, {})

    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({ accepted: true })
    expect(openTerminal).toHaveBeenCalledOnce()

    expect((await postJson(routes, DESKTOP_TERMINAL_OPEN_PATH, { command: 'dsh plugin add untrusted' })).status).toBe(400)
    expect((await postJson(routes, DESKTOP_TERMINAL_OPEN_PATH, {}, { headers: { origin: 'https://example.com' } })).status).toBe(403)
    expect(openTerminal).toHaveBeenCalledOnce()
  })

  it('exports diagnostics, opens the native creator, and starts rollback only after response', async () => {
    const exportDiagnostics = vi.fn(async () => {})
    const openProfileCreator = vi.fn()
    const afterResponse = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      exportDiagnostics,
      openProfileCreator,
      prepareProfileRollback: () => ({
        response: { accepted: true, restartRequired: true, targetProfile: 'desktop' },
        afterResponse,
      }),
    })))

    const diagnosticResponse = await postJson(routes, DESKTOP_DIAGNOSTICS_EXPORT_PATH, {})
    const creatorResponse = await postJson(routes, DESKTOP_PROFILE_CREATE_WINDOW_PATH, {})
    const rollbackResponse = await postJson(routes, DESKTOP_PROFILE_ROLLBACK_PATH, {})

    expect(diagnosticResponse.status).toBe(200)
    expect(creatorResponse.status).toBe(200)
    expect(rollbackResponse.status).toBe(202)
    expect(exportDiagnostics).toHaveBeenCalledOnce()
    expect(openProfileCreator).toHaveBeenCalledOnce()
    await nextTurn()
    expect(afterResponse).not.toHaveBeenCalled()
    expect(await rollbackResponse.json()).toEqual({
      accepted: true,
      restartRequired: true,
      targetProfile: 'desktop',
    })
    await nextTurn()
    expect(afterResponse).toHaveBeenCalledOnce()
  })

  it('reports a restart that throws instead of answering it', async () => {
    const reportError = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      prepareProfileRollback: () => ({
        response: { accepted: true, restartRequired: true, targetProfile: 'desktop' },
        afterResponse: () => { throw new Error('relaunch refused') },
      }),
    })), reportError)

    const res = await postJson(routes, DESKTOP_PROFILE_ROLLBACK_PATH, {})
    expect(res.status).toBe(202)
    await res.json()
    await nextTurn()

    expect(reportError).toHaveBeenCalledWith('restore last-known-good Profile restart', expect.any(Error))
  })

  it('reports terminal launch failures without exposing the native cause', async () => {
    const reportError = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      openTerminal: () => { throw new Error('open -a Terminal failed at /private/path') },
    })), reportError)

    const res = await postJson(routes, DESKTOP_TERMINAL_OPEN_PATH, {})
    const text = await res.text()

    expect(res.status).toBe(500)
    expect(JSON.parse(text)).toEqual({ error: 'terminal could not be opened' })
    expect(text).not.toContain('/private')
    expect(reportError).toHaveBeenCalledWith('open terminal', expect.any(Error))
  })

  it('reports stable operation errors without exposing native causes', async () => {
    const reportError = vi.fn()
    const routes = desktopSettingsRoutes(new DesktopSettingsController(bootstrap({
      profiles: {
        current: { name: DESKTOP.name, dir: DESKTOP.dir },
        list: () => [],
        create: () => { throw new Error('EACCES /private/profiles/work') },
      },
    })), reportError)

    const res = await postJson(routes, DESKTOP_PROFILE_CREATE_PATH, { name: 'work' })
    const text = await res.text()

    expect(res.status).toBe(409)
    expect(JSON.parse(text)).toEqual({ error: 'profile could not be created' })
    expect(text).not.toContain('/private')
    expect(reportError).toHaveBeenCalledWith('create profile', expect.any(Error))
  })

  it('rejects another method before invoking the controller', async () => {
    const readMarket = vi.fn(() => market())
    const controller = new DesktopSettingsController(bootstrap({ readMarket }))
    readMarket.mockClear()

    const res = await call(desktopSettingsRoutes(controller), DESKTOP_SETTINGS_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toContain('GET')
    expect(await res.json()).toEqual({ error: 'method not allowed' })
    expect(readMarket).not.toHaveBeenCalled()
  })
})
