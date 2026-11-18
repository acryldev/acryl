/**
 * What a Service's fields look like to the plugins that call it. A plugin reaches a service through its own shadow of the instance
 * (`ctx.counter` in plugin A and in plugin B are two different objects over one service), but reads and writes of fields pass through to
 * the one instance: a field assigned in a method is seen by every caller, as is state kept in an object that is only mutated. What the
 * shadow does change is `this.ctx` inside a method, which `live-install.spec.ts` covers.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'

declare module '@deepseek-ai/cordis' {
  interface Context {
    counter: Counter
  }
}

const contexts: Context[] = []
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

class Counter extends Service {
  /** Reassigned by `assign`. */
  assigned = 0
  /** Created once, only mutated. */
  private readonly state = { count: 0 }

  constructor(ctx: Context) {
    super(ctx, 'counter')
  }

  assign(): void {
    this.assigned += 1
  }

  mutate(): void {
    this.state.count += 1
  }

  get count(): number {
    return this.state.count
  }
}

async function twoCallers(): Promise<{ a: Context, b: Context }> {
  const root = new Context()
  contexts.push(root)
  root.plugin({ name: 'counter', apply: (ctx: Context) => { new Counter(ctx) } })
  const callers: Context[] = []
  for (const name of ['a', 'b']) root.plugin({ name, inject: ['counter'], apply: (ctx: Context) => { callers.push(ctx) } })
  await settle()
  const [a, b] = callers
  if (a === undefined || b === undefined) throw new Error('both callers should be active')
  return { a, b }
}

describe('service state and the shadow context', () => {
  it('shows a field assigned in a method through one caller to every caller', async () => {
    const { a, b } = await twoCallers()
    a.counter.assign()
    b.counter.assign()
    expect(a.counter.assigned).toBe(2)
    expect(b.counter.assigned).toBe(2)
  })

  it('shows a field assigned from outside through one caller to every caller', async () => {
    const { a, b } = await twoCallers()
    a.counter.assigned = 5
    expect(b.counter.assigned).toBe(5)
  })

  it('shares state kept in one object that is only mutated', async () => {
    const { a, b } = await twoCallers()
    a.counter.mutate()
    b.counter.mutate()
    expect(a.counter.count).toBe(2)
    expect(b.counter.count).toBe(2)
  })
})
