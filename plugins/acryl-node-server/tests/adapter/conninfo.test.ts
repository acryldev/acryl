import { Acryl } from 'acryl-router'
import type { AddressType, ConnInfo } from 'acryl-router/helpers'
import { getConnInfo } from '../../src/adapter/conninfo.ts'

describe('ConnInfo', () => {
  it('Should works', async () => {
    const app = new Acryl().get('/', (c) => c.json(getConnInfo(c)))

    const socket = {
      remoteAddress: '0.0.0.0',
      remoteFamily: 'IPv4',
      remotePort: 3030,
    }
    expect(
      await (
        await app.request(
          '/',
          {},
          {
            incoming: {
              socket,
            },
          }
        )
      ).json()
    ).toEqual({
      remote: {
        address: socket.remoteAddress,
        addressType: socket.remoteFamily as AddressType,
        port: socket.remotePort,
      },
    } satisfies ConnInfo)
  })
})
