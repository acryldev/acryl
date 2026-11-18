import { Context } from '../../context.ts'
import { getConnInfo } from './conninfo.ts'
import type { CloudFrontEdgeEvent } from './handler.ts'

describe('getConnInfo', () => {
  it('Should info is valid', () => {
    const clientIp = Math.random().toString()
    const env = {
      event: {
        Records: [
          {
            cf: {
              request: {
                clientIp,
              },
            },
          },
        ],
      } as CloudFrontEdgeEvent,
    }

    const c = new Context(new Request('http://localhost/'), { env })
    const info = getConnInfo(c)

    expect(info.remote.address).toBe(clientIp)
  })
})
