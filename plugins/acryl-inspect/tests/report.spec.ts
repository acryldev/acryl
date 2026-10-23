import { describe, expect, it } from 'vitest'
import { explain, renderReports, reportFiber, stateName, type FiberView } from '../src/report.ts'

function fiber(over: Partial<FiberView> & { effects?: FiberView['getEffects'] extends () => infer R ? R : never } = {}): FiberView {
  const { effects = [], ...rest } = over
  return { state: 2, inject: {}, runtime: { name: 'demo' }, getEffects: () => effects, ...rest }
}

describe('reportFiber', () => {
  it('sorts effects into provides, routes, middleware and everything else, including nested ones', () => {
    const report = reportFiber(fiber({
      inject: { router: null, acrylSettings: null },
      effects: [
        { label: 'ctx.provide("things")', children: [] },
        { label: 'acryl-router: GET /api/things/:id', children: [] },
        { label: 'acryl-router: POST /api/things', children: [{ label: 'inner timer', children: [] }] },
        { label: 'acryl-router: use /api', children: [] },
        { label: 'ctx.on("internal/status")', children: [] },
      ],
    }))
    expect(report).toEqual({
      name: 'demo',
      state: 'ACTIVE',
      requires: ['acrylSettings', 'router'],
      provides: ['things'],
      routes: [{ method: 'GET', path: '/api/things/:id' }, { method: 'POST', path: '/api/things' }],
      middleware: ['/api'],
      other: ['inner timer', 'ctx.on("internal/status")'],
      removedOnUnload: 6,
    })
  })

  it('names the state and an anonymous plugin', () => {
    expect(stateName(0)).toBe('PENDING')
    expect(stateName(2)).toBe('ACTIVE')
    expect(stateName(5)).toBe('UNLOADING')
    expect(reportFiber(fiber({ runtime: null })).name).toBe('anonymous')
  })
})

describe('explain', () => {
  it('says what a plugin needs, adds and removes on unload', () => {
    const text = explain(reportFiber(fiber({
      inject: { router: null },
      effects: [{ label: 'acryl-router: GET /a', children: [] }],
    })))
    expect(text).toContain('demo (ACTIVE)')
    expect(text).toContain('needs:     router')
    expect(text).toContain('routes:    GET /a')
    expect(text).toContain('unloading: removes 1 registration and nothing else')
  })

  it('says a pending plugin is waiting for its services', () => {
    const text = explain(reportFiber(fiber({ state: 0, inject: { router: null, webServer: null } })))
    expect(text).toContain('demo (PENDING)')
    expect(text).toContain('it starts when router, webServer are available')
  })

  it('renders several plugins as blocks', () => {
    const a = reportFiber(fiber({ runtime: { name: 'a' } }))
    const b = reportFiber(fiber({ runtime: { name: 'b' } }))
    expect(renderReports([a, b]).split('\n\n')).toHaveLength(2)
  })
})
