import { env, getRuntimeKey } from './index.ts'
import { Acryl } from '../../app.ts'

describe('getRuntimeKey', () => {
  it('Should return the current runtime key', () => {
    // Now, using the `bun run test` command.
    // But `vitest` depending Node.js will run this test so the RuntimeKey will be `node`.
    expect(getRuntimeKey()).toBe('node')
  })
})

describe('env', () => {
  describe('Types', () => {
    type Env = {
      Bindings: {
        MY_VAR: string
      }
    }

    it('Should not throw type errors with env has generics', () => {
      const app = new Acryl()
      app.get('/var', (c) => {
        const { MY_VAR } = env<{ MY_VAR: string }>(c)
        expectTypeOf<string>(MY_VAR)
        return c.json({
          var: MY_VAR,
        })
      })
    })

    it('Should not throw type errors with Acryl has generics', () => {
      const app = new Acryl<Env>()

      app.get('/var', (c) => {
        const { MY_VAR } = env(c)
        expectTypeOf<string>(MY_VAR)
        return c.json({
          var: MY_VAR,
        })
      })
    })

    it('Should not throw type errors with env and Acryl have generics', () => {
      const app = new Acryl<Env>()

      app.get('/var', (c) => {
        const { MY_VAR } = env<{ MY_VAR: string }>(c)
        expectTypeOf<string>(MY_VAR)
        return c.json({
          var: MY_VAR,
        })
      })
    })
  })
})
