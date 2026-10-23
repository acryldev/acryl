import { RETAINED_304_HEADERS, etag } from './index.ts'
import { App } from '../../app.ts'

const createPatternedBody = (length: number) => {
  const body = new Uint8Array(length)
  for (let i = 0; i < body.byteLength; i++) {
    body[i] = i % 256
  }
  return body
}

describe('Etag Middleware', () => {
  it('Should return etag header', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/abc', (c) => {
      return c.text('App is hot')
    })
    app.get('/etag/def', (c) => {
      return c.json({ message: 'App is hot' })
    })
    let res = await app.request('http://localhost/etag/abc')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe('"7c6c452b40ba15d4748e0075f4e402b441c3ea15"')

    res = await app.request('http://localhost/etag/def')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe('"a6c237463eac08cd32a99f595cc2a7c87aecaadc"')
  })

  it('Should return etag header with another algorithm', async () => {
    const app = new App()
    app.use(
      '/etag/*',
      etag({
        generateDigest: (body) =>
          crypto.subtle.digest(
            {
              name: 'SHA-256',
            },
            body
          ),
      })
    )
    app.get('/etag/abc', (c) => {
      return c.text('App is hot')
    })
    app.get('/etag/def', (c) => {
      return c.json({ message: 'App is hot' })
    })
    let res = await app.request('http://localhost/etag/abc')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe(
      '"dc6a4486c5794ab001967920a901c34bde9f9485c77eccf142e13b446c6da381"'
    )

    res = await app.request('http://localhost/etag/def')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe(
      '"f467464463b028d082ec4327b42c87428502dd71740110d5e5b4e2fbcd8b366d"'
    )
  })

  it('Should return etag header - binary', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag', async (c) => {
      return c.body(new Uint8Array(1))
    })

    const res = await app.request('http://localhost/etag')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    const etagHeader = res.headers.get('ETag')
    expect(etagHeader).toBe('"5ba93c9db0cff93f52b521d7420e43f6eda2784f"')
  })

  it('Should not be the same etag - arrayBuffer', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/ab1', (c) => {
      return c.body(new ArrayBuffer(1))
    })
    app.get('/etag/ab2', (c) => {
      return c.body(new ArrayBuffer(2))
    })

    let res = await app.request('http://localhost/etag/ab1')
    const hash = res.headers.get('Etag')
    res = await app.request('http://localhost/etag/ab2')
    expect(res.headers.get('ETag')).not.toBe(hash)
  })

  it('Should not be the same etag - Uint8Array', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/ui1', (c) => {
      return c.body(new Uint8Array([1, 2, 3]))
    })
    app.get('/etag/ui2', (c) => {
      return c.body(new Uint8Array([1, 2, 3, 4]))
    })

    let res = await app.request('http://localhost/etag/ui1')
    const hash = res.headers.get('Etag')
    res = await app.request('http://localhost/etag/ui2')
    expect(res.headers.get('ETag')).not.toBe(hash)
  })

  it('Should not be the same etag - ReadableStream', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/rs1', (c) => {
      return c.body(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
            controller.enqueue(new Uint8Array([2]))
            controller.close()
          },
        })
      )
    })
    app.get('/etag/rs2', (c) => {
      return c.body(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
            controller.enqueue(new Uint8Array([3]))
            controller.close()
          },
        })
      )
    })

    let res = await app.request('http://localhost/etag/rs1')
    const hash = res.headers.get('Etag')
    res = await app.request('http://localhost/etag/rs2')
    expect(res.headers.get('ETag')).not.toBe(hash)
  })

  it('Should return the same etag regardless of ReadableStream chunk boundaries', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    const body = createPatternedBody(1_000_000)
    app.get('/etag/rs1', (c) => {
      return c.body(
        new ReadableStream({
          start(controller) {
            controller.enqueue(body)
            controller.close()
          },
        })
      )
    })
    app.get('/etag/rs2', (c) => {
      return c.body(
        new ReadableStream({
          start(controller) {
            controller.enqueue(body.slice(0, 1))
            controller.enqueue(body.slice(1, 32_769))
            controller.enqueue(body.slice(32_769))
            controller.close()
          },
        })
      )
    })

    const res1 = await app.request('http://localhost/etag/rs1')
    const res2 = await app.request('http://localhost/etag/rs2')
    const expected = '"550563e0460b33a3540278a8446a70bb96eb5172"'
    expect(res1.headers.get('ETag')).toBe(expected)
    expect(res2.headers.get('ETag')).toBe(expected)
  })

  it('Should preserve the SHA-1 digest for bodies up to 256 KiB', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag', (c) => c.body(createPatternedBody(256 * 1024)))

    const res = await app.request('http://localhost/etag')
    expect(res.headers.get('ETag')).toBe('"37ef77696fc255bf53b4cdd014b223676f2dc8bb"')
  })

  it('Should not return etag header when the stream is empty', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/abc', (c) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      return c.body(stream)
    })
    const res = await app.request('http://localhost/etag/abc')
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBeNull()
  })

  it('Should not return etag header when body is null', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/abc', () => new Response(null, { status: 500 }))
    const res = await app.request('http://localhost/etag/abc')
    expect(res.status).toBe(500)
    expect(res.headers.get('ETag')).toBeNull()
  })

  it('Should return etag header - weak', async () => {
    const app = new App()
    app.use('/etag/*', etag({ weak: true }))
    app.get('/etag/abc', (c) => {
      return c.text('App is hot')
    })

    const res = await app.request('http://localhost/etag/abc')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe('W/"7c6c452b40ba15d4748e0075f4e402b441c3ea15"')
  })

  it('Should handle conditional GETs', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/ghi', (c) =>
      c.text('App is great', 200, {
        'cache-control': 'public, max-age=120',
        date: 'Mon, Feb 27 2023 12:08:36 GMT',
        expires: 'Mon, Feb 27 2023 12:10:36 GMT',
        server: 'Upstream 1.2',
        vary: 'Accept-Language',
      })
    )

    // unconditional GET
    let res = await app.request('http://localhost/etag/ghi')
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).not.toBeFalsy()
    const etagHeaderValue = res.headers.get('ETag') || ''

    // conditional GET with the wrong ETag:
    res = await app.request('http://localhost/etag/ghi', {
      headers: {
        'If-None-Match': '"not the right etag"',
      },
    })
    expect(res.status).toBe(200)

    // conditional GET with matching ETag:
    res = await app.request('http://localhost/etag/ghi', {
      headers: {
        'If-None-Match': etagHeaderValue,
      },
    })
    expect(res.status).toBe(304)
    expect(res.headers.get('Etag')).toBe(etagHeaderValue)
    expect(await res.text()).toBe('')
    expect(res.headers.get('cache-control')).toBe('public, max-age=120')
    expect(res.headers.get('date')).toBe('Mon, Feb 27 2023 12:08:36 GMT')
    expect(res.headers.get('expires')).toBe('Mon, Feb 27 2023 12:10:36 GMT')
    expect(res.headers.get('server')).toBeFalsy()
    expect(res.headers.get('vary')).toBe('Accept-Language')

    // conditional GET with matching ETag among list:
    res = await app.request('http://localhost/etag/ghi', {
      headers: {
        'If-None-Match': `"mismatch 1", ${etagHeaderValue}, "mismatch 2"`,
      },
    })
    expect(res.status).toBe(304)

    // conditional GET with matching ETag among list, OWS before the comma (RFC 9110):
    res = await app.request('http://localhost/etag/ghi', {
      headers: {
        'If-None-Match': `"mismatch 1", ${etagHeaderValue} , "mismatch 2"`,
      },
    })
    expect(res.status).toBe(304)

    // conditional GET with `*` wildcard:
    res = await app.request('http://localhost/etag/ghi', {
      headers: {
        'If-None-Match': '*',
      },
    })
    expect(res.status).toBe(304)
  })

  it('Should handle conditional QUERY requests', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.on('QUERY', '/etag/query', (c) => c.text('App is great'))

    // unconditional QUERY
    let res = await app.request('http://localhost/etag/query', {
      method: 'QUERY',
      body: 'select *',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).not.toBeFalsy()
    const etagHeaderValue = res.headers.get('ETag') || ''

    // conditional QUERY with the wrong ETag:
    res = await app.request('http://localhost/etag/query', {
      method: 'QUERY',
      body: 'select *',
      headers: {
        'If-None-Match': '"not the right etag"',
      },
    })
    expect(res.status).toBe(200)

    // conditional QUERY with matching ETag:
    res = await app.request('http://localhost/etag/query', {
      method: 'QUERY',
      body: 'select *',
      headers: {
        'If-None-Match': etagHeaderValue,
      },
    })
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(etagHeaderValue)
    expect(await res.text()).toBe('')

    // conditional QUERY with `*` wildcard:
    res = await app.request('http://localhost/etag/query', {
      method: 'QUERY',
      body: 'select *',
      headers: {
        'If-None-Match': '*',
      },
    })
    expect(res.status).toBe(304)
  })

  it('Should not return 304 on unsafe methods or error responses', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.put('/etag/put', (c) => c.text('created', 201, { ETag: '"etag-123"' }))
    app.get('/etag/not-found', (c) => c.text('not found', 404, { ETag: '"etag-123"' }))

    // Unsafe methods:
    let res = await app.request('http://localhost/etag/put', {
      method: 'PUT',
      headers: {
        'If-None-Match': '*',
      },
    })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('created')

    res = await app.request('http://localhost/etag/put', {
      method: 'PUT',
      headers: {
        'If-None-Match': '"etag-123"',
      },
    })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('created')

    // Error responses:
    res = await app.request('http://localhost/etag/not-found', {
      headers: {
        'If-None-Match': '*',
      },
    })
    expect(res.status).toBe(404)

    res = await app.request('http://localhost/etag/not-found', {
      headers: {
        'If-None-Match': '"etag-123"',
      },
    })
    expect(res.status).toBe(404)
  })

  it('Should not return duplicate etag header values', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.use('/etag/*', etag())
    app.get('/etag/abc', (c) => c.text('App is hot'))

    const res = await app.request('http://localhost/etag/abc')
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe('"7c6c452b40ba15d4748e0075f4e402b441c3ea15"')
  })

  it('Should not override ETag headers from upstream', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/predefined', (c) =>
      c.text('This response has an ETag', 200, { ETag: '"f-0194-d"' })
    )

    const res = await app.request('http://localhost/etag/predefined')
    expect(res.headers.get('ETag')).toBe('"f-0194-d"')
  })

  it('Should retain the default and the specified headers', async () => {
    const cacheControl = 'public, max-age=120'
    const message = 'Hello!'
    const app = new App()
    app.use(
      '/etag/*',
      etag({
        retainedHeaders: ['x-message-retain', 'X-Message-Retain-Upper', ...RETAINED_304_HEADERS],
      })
    )
    app.get('/etag', (c) => {
      return c.text('App is hot', 200, {
        'cache-control': cacheControl,
        'x-message-retain': message,
        'X-Message-Retain-Upper': message,
        'x-message': message,
      })
    })
    const res = await app.request('/etag', {
      headers: {
        'If-None-Match': '"7c6c452b40ba15d4748e0075f4e402b441c3ea15"',
      },
    })
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).not.toBeFalsy()
    expect(res.headers.get('ETag')).toBe('"7c6c452b40ba15d4748e0075f4e402b441c3ea15"')
    expect(res.headers.get('Cache-Control')).toBe(cacheControl)
    expect(res.headers.get('x-message-retain')).toBe(message)
    expect(res.headers.get('X-Message-Retain-Upper')).toBe(message)
    expect(res.headers.get('x-message')).toBeFalsy()
  })

  it('Should return 304 when weak ETag in If-None-Match matches the generated ETag', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/abc', (c) => {
      return c.text('App is hot')
    })
    let res = await app.request('http://localhost/etag/abc')
    const headerEtag = res.headers.get('ETag')!

    expect(headerEtag).not.toBeFalsy()

    res = await app.request('http://localhost/etag/abc', {
      headers: {
        'If-None-Match': 'W/"7c6c452b40ba15d4748e0075f4e402b441c3ea15"',
      },
    })

    expect(res.status).toBe(304)
  })

  describe('When crypto is not available', () => {
    let _crypto: Crypto | undefined
    beforeAll(() => {
      _crypto = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        value: {},
      })
    })

    afterAll(() => {
      Object.defineProperty(globalThis, 'crypto', {
        value: _crypto,
      })
    })

    it('Should not generate etag', async () => {
      const app = new App()
      app.use('/etag/*', etag())
      app.get('/etag/no-digest', (c) => c.text('App is hot'))
      const res = await app.request('/etag/no-digest')
      expect(res.status).toBe(200)
      expect(res.headers.get('ETag')).toBeNull()
    })
  })

  it('Should remove all non-retained headers on 304 without skipping any', async () => {
    const app = new App()
    app.use('/etag/*', etag())
    app.get('/etag/multi-headers', (c) => {
      c.header('X-Custom-1', 'val1')
      c.header('X-Custom-2', 'val2')
      c.header('X-Custom-3', 'val3')
      c.header('X-Custom-4', 'val4')
      c.header('Cache-Control', 'max-age=3600')
      return c.text('App is hot')
    })
    const res1 = await app.request('http://localhost/etag/multi-headers')
    const etagHeader = res1.headers.get('ETag')!
    expect(res1.status).toBe(200)

    const res2 = await app.request('http://localhost/etag/multi-headers', {
      headers: {
        'If-None-Match': etagHeader,
      },
    })
    expect(res2.status).toBe(304)
    expect(res2.headers.get('ETag')).toBe(etagHeader)
    expect(res2.headers.get('Cache-Control')).toBe('max-age=3600')
    expect(res2.headers.get('X-Custom-1')).toBeNull()
    expect(res2.headers.get('X-Custom-2')).toBeNull()
    expect(res2.headers.get('X-Custom-3')).toBeNull()
    expect(res2.headers.get('X-Custom-4')).toBeNull()
  })
})
