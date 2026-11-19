import { getRouterName } from '../helper/dev/index.ts'
import { Acryl } from './quick.ts'

describe('acryl-router/quick preset', () => {
  it('Should have SmartRouter + LinearRouter', async () => {
    const app = new Acryl()
    expect(getRouterName(app)).toBe('SmartRouter + LinearRouter')
  })
})

describe('Generics for Bindings and Variables', () => {
  interface CloudflareBindings {
    MY_VARIABLE: string
  }

  it('Should not throw type errors', () => {
    // @ts-expect-error Bindings should extend object
    new Acryl<{
      Bindings: number
    }>()

    const appWithInterface = new Acryl<{
      Bindings: CloudflareBindings
    }>()

    appWithInterface.get('/', (c) => {
      expectTypeOf(c.env.MY_VARIABLE).toMatchTypeOf<string>()
      return c.text('/')
    })

    const appWithType = new Acryl<{
      Bindings: {
        foo: string
      }
    }>()

    appWithType.get('/', (c) => {
      expectTypeOf(c.env.foo).toMatchTypeOf<string>()
      return c.text('Hello Acryl!')
    })
  })
})
