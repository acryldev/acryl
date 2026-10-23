import { describe, expect, it } from 'vitest'
import { RouteTable } from '../src/table.ts'
import { conformance, type Candidate } from './conformance.ts'

function tableCandidate(trailingSlash: 'strict' | 'ignore' = 'strict', onError?: (e: unknown) => void): Candidate & { table: RouteTable } {
  const table = new RouteTable({ trailingSlash, ...(onError === undefined ? {} : { onError }) })
  return {
    table,
    route: (method, path, handler) => table.add(method, path, handler),
    use: (path, middleware) => table.use(path, middleware),
    fetch: request => table.dispatch(request, new AbortController().signal),
    size: () => table.size,
  }
}

conformance('RouteTable (the pure core)', () => tableCandidate())

describe('RouteTable specifics', () => {
  it('keeps /a and /a/ distinct under strict and joins them under ignore', async () => {
    const strict = tableCandidate('strict')
    strict.route('GET', '/a', c => c.text('a'))
    expect((await strict.fetch(new Request('http://t/a/'))).status).toBe(404)
    const loose = tableCandidate('ignore')
    loose.route('GET', '/a', c => c.text('a'))
    expect((await loose.fetch(new Request('http://t/a/'))).status).toBe(200)
  })

  it('reports handler errors to onError and still answers 500', async () => {
    const seen: unknown[] = []
    const c = tableCandidate('strict', e => seen.push(e))
    c.route('GET', '/x', () => { throw new Error('nope') })
    expect((await c.fetch(new Request('http://t/x'))).status).toBe(500)
    expect(seen).toHaveLength(1)
  })

  it('answers 499 instead of 500 when the request was aborted', async () => {
    const c = tableCandidate()
    const controller = new AbortController()
    c.route('GET', '/slow', async ctx => {
      await new Promise((_resolve, reject) => { ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) })
      return ctx.text('never')
    })
    const pending = c.table.dispatch(new Request('http://t/slow'), controller.signal)
    controller.abort()
    expect((await pending).status).toBe(499)
  })
})
