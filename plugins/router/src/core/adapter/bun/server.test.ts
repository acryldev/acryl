import { Context } from '../../context.ts'
import { getBunServer } from './server.ts'

describe('getBunServer', () => {
  it('Should success to pick Server', () => {
    const server = {}

    expect(getBunServer(new Context(new Request('http://localhost/'), { env: server }))).toBe(
      server
    )
    expect(getBunServer(new Context(new Request('http://localhost/'), { env: { server } }))).toBe(
      server
    )
  })
})
