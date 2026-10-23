import { App } from 'acryl-router'
import type { HttpBindings } from '../../../src/adapter/index.ts'
import { createAdaptorServer } from '../../../src/adapter/server.ts'
import { RESPONSE_ALREADY_SENT } from '../../../src/adapter/utils/response.ts'
import { requestServer } from '../helpers/request.ts'

describe('RESPONSE_ALREADY_SENT', () => {
  const app = new App<{ Bindings: HttpBindings }>()
  app.get('/', (c) => {
    const { outgoing } = c.env
    outgoing.writeHead(200, { 'Content-Type': 'text/plain' })
    outgoing.end('App!')
    return RESPONSE_ALREADY_SENT
  })
  const server = createAdaptorServer(app)

  it('Should return 200 response - GET /', async () => {
    const res = await requestServer(server, { method: 'GET', path: '/' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch('text/plain')
    expect(await res.text()).toBe('App!')
  })
})
