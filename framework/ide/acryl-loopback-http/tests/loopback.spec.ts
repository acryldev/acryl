import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  BodyTooLargeError,
  error,
  finishJson,
  isJsonRequest,
  isLoopbackAddress,
  INVALID_BODY,
  isSameOriginLoopbackRequest,
  parseJsonPostBody,
  readJsonBody,
} from '../src/index.ts'

const ORIGIN = 'http://127.0.0.1:43120'

function request(headers: Record<string, string>, remoteAddress = '127.0.0.1', body?: string): IncomingMessage {
  const req = Readable.from(body === undefined ? [] : [body]) as IncomingMessage
  req.headers = { host: '127.0.0.1:43120', ...headers }
  Object.defineProperty(req, 'socket', { configurable: true, value: { remoteAddress } })
  return req
}

describe('isLoopbackAddress', () => {
  it.each(['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1'])('accepts %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(true)
  })
  it.each([undefined, '10.0.0.2', '192.168.1.5', '::ffff:10.0.0.2', '2001:db8::1', ''])('refuses %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(false)
  })
})

describe('isSameOriginLoopbackRequest', () => {
  it('accepts the exact Origin for a mutating request, with or without fetch metadata', () => {
    expect(isSameOriginLoopbackRequest(request({ origin: ORIGIN }), ORIGIN, true)).toBe(true)
    expect(isSameOriginLoopbackRequest(request({ origin: ORIGIN, 'sec-fetch-site': 'same-origin' }), ORIGIN, true)).toBe(true)
  })

  it('refuses a mutating request from another origin, a look-alike, or none', () => {
    for (const origin of ['http://evil.example', 'http://127.0.0.1:43121', 'https://127.0.0.1:43120', `${ORIGIN}/`, 'null', `${ORIGIN}.evil.example`]) {
      expect(isSameOriginLoopbackRequest(request({ origin }), ORIGIN, true)).toBe(false)
    }
    expect(isSameOriginLoopbackRequest(request({}), ORIGIN, true)).toBe(false)
    expect(isSameOriginLoopbackRequest(request({ referer: `${ORIGIN}/x`, 'sec-fetch-site': 'same-origin' }), ORIGIN, true)).toBe(false)
  })

  it('refuses a matching Origin that fetch metadata says is cross-site', () => {
    expect(isSameOriginLoopbackRequest(request({ origin: ORIGIN, 'sec-fetch-site': 'cross-site' }), ORIGIN, true)).toBe(false)
  })

  it('lets a read-only GET use fetch metadata plus its same-origin referrer', () => {
    expect(isSameOriginLoopbackRequest(request({ 'sec-fetch-site': 'same-origin', referer: `${ORIGIN}/page` }), ORIGIN, false)).toBe(true)
    expect(isSameOriginLoopbackRequest(request({ 'sec-fetch-site': 'same-origin', referer: 'http://evil.example/page' }), ORIGIN, false)).toBe(false)
    expect(isSameOriginLoopbackRequest(request({ 'sec-fetch-site': 'cross-site', referer: `${ORIGIN}/page` }), ORIGIN, false)).toBe(false)
    expect(isSameOriginLoopbackRequest(request({ referer: `${ORIGIN}/page` }), ORIGIN, false)).toBe(false)
  })

  it('refuses a remote peer and a wrong Host even with a correct Origin', () => {
    expect(isSameOriginLoopbackRequest(request({ origin: ORIGIN }, '10.0.0.2'), ORIGIN, true)).toBe(false)
    expect(isSameOriginLoopbackRequest(request({ origin: ORIGIN, host: 'evil.example' }), ORIGIN, true)).toBe(false)
    expect(isSameOriginLoopbackRequest(request({ origin: ORIGIN, host: '127.0.0.1:1' }), ORIGIN, true)).toBe(false)
  })

  it('refuses an expected origin that is not a plain loopback http origin', () => {
    for (const bad of ['http://localhost:43120', 'https://127.0.0.1:43120', 'http://user:pw@127.0.0.1:43120', 'http://0.0.0.0:43120', 'not a url', `${ORIGIN}/path`]) {
      expect(isSameOriginLoopbackRequest(request({ origin: bad, host: '127.0.0.1:43120' }), bad, true)).toBe(false)
    }
  })

  it('accepts the IPv6 loopback origin', () => {
    const origin = 'http://[::1]:43120'
    expect(isSameOriginLoopbackRequest(request({ origin, host: '[::1]:43120' }, '::1'), origin, true)).toBe(true)
  })
})

describe('isJsonRequest', () => {
  it('reads the media type, ignoring parameters and case', () => {
    expect(isJsonRequest(request({ 'content-type': 'application/json' }))).toBe(true)
    expect(isJsonRequest(request({ 'content-type': 'Application/JSON; charset=utf-8' }))).toBe(true)
    expect(isJsonRequest(request({ 'content-type': 'text/plain' }))).toBe(false)
    expect(isJsonRequest(request({}))).toBe(false)
  })
})

describe('readJsonBody', () => {
  it('parses a body within the cap', async () => {
    expect(await readJsonBody(request({ 'content-length': '7' }, '127.0.0.1', '{"a":1}'))).toEqual({ a: 1 })
  })
  it('refuses a body over the cap, declared or streamed', async () => {
    await expect(readJsonBody(request({ 'content-length': '999999' }, '127.0.0.1', '{}'))).rejects.toBeInstanceOf(BodyTooLargeError)
    await expect(readJsonBody(request({}, '127.0.0.1', `{"a":"${'x'.repeat(40)}"}`), 20)).rejects.toBeInstanceOf(BodyTooLargeError)
  })
  it('refuses a malformed length or malformed JSON', async () => {
    await expect(readJsonBody(request({ 'content-length': '12abc' }, '127.0.0.1', '{}'))).rejects.toBeInstanceOf(SyntaxError)
    await expect(readJsonBody(request({}, '127.0.0.1', '{nope'))).rejects.toBeInstanceOf(SyntaxError)
  })
})

describe('finishJson', () => {
  it('writes the status, safe headers and the JSON value', () => {
    const headers: Record<string, string> = {}
    const res = { statusCode: 0, setHeader: vi.fn((name: string, value: string) => { headers[name] = value }), end: vi.fn() } as unknown as ServerResponse
    finishJson(res, 409, error('nope'), 'POST')
    expect(res.statusCode).toBe(409)
    expect(headers).toMatchObject({ 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', allow: 'POST' })
    expect(res.end).toHaveBeenCalledWith('{"error":"nope"}')
  })
})

describe('parseJsonPostBody', () => {
  function response(): ServerResponse & { status: () => number } {
    const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() }
    return Object.assign(res as unknown as ServerResponse, { status: () => res.statusCode })
  }
  it('returns the parsed body for JSON', async () => {
    const res = response()
    expect(await parseJsonPostBody(request({ 'content-type': 'application/json' }, '127.0.0.1', '{"a":1}'), res)).toEqual({ a: 1 })
    expect(res.status()).toBe(200)
  })
  it('answers 415, 413 and 400 itself and returns INVALID_BODY', async () => {
    let res = response()
    expect(await parseJsonPostBody(request({ 'content-type': 'text/plain' }, '127.0.0.1', '{}'), res)).toBe(INVALID_BODY)
    expect(res.status()).toBe(415)
    res = response()
    expect(await parseJsonPostBody(request({ 'content-type': 'application/json' }, '127.0.0.1', `{"a":"${'x'.repeat(50)}"}`), res, 20)).toBe(INVALID_BODY)
    expect(res.status()).toBe(413)
    res = response()
    expect(await parseJsonPostBody(request({ 'content-type': 'application/json' }, '127.0.0.1', '{nope'), res)).toBe(INVALID_BODY)
    expect(res.status()).toBe(400)
  })
})
