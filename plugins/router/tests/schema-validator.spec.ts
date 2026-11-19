/**
 * `schemaValidator` with every Standard Schema v1 form an app can hand it: a library schema (Zod, Schemastery), a hand-written object
 * with the full `~standard` properties, and the `{ validate }`-only object the 0.7.0 docs showed.
 */

import z from '@deepseek-ai/schemastery'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z as zod } from 'zod'
import { schemaValidator, testClient, type StandardSchema } from '../src/helpers/index.ts'
import { Acryl } from '../src/index.ts'

interface Note { title: string }

/** A hand-written schema with every `~standard` property the specification defines (the annotation is the excess-property check). */
const specShaped: StandardSchema<unknown, Note> = {
  '~standard': {
    version: 1,
    vendor: 'notes-app',
    validate: (value: unknown) => {
      const title = (value as { title?: unknown } | null)?.title
      return typeof title === 'string' && title !== ''
        ? { value: { title } }
        : { issues: [{ message: 'title is required', path: [{ key: 'title' }] }] }
    },
    types: { input: {} as unknown, output: {} as Note },
  },
}

const notes = (schema: StandardSchema<unknown, Note>) =>
  new Acryl().post('/notes', schemaValidator('json', schema), c => c.json(c.req.valid('json'), 201))

const post = (app: ReturnType<typeof notes>, body: unknown) =>
  app.request('/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('schemaValidator', () => {
  it('accepts a hand-written schema with the full ~standard properties and types the handler by its output', async () => {
    const app = new Acryl().post('/notes', schemaValidator('json', specShaped), c => {
      expectTypeOf(c.req.valid('json')).toEqualTypeOf<Note>()
      return c.json(c.req.valid('json'), 201)
    })
    const created = await post(app, { title: 'Groceries' })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ title: 'Groceries' })
    const rejected = await post(app, { title: '' })
    expect(rejected.status).toBe(400)
    // A path segment object reads as its key.
    expect(await rejected.json()).toEqual({ error: 'invalid json', issues: [{ message: 'title is required', path: 'title' }] })
  })

  it('accepts a Zod schema as it is, typed by its output', async () => {
    const schema = zod.object({ title: zod.string().min(1) })
    const app = new Acryl().post('/notes', schemaValidator('json', schema), c => {
      expectTypeOf(c.req.valid('json')).toEqualTypeOf<{ title: string }>()
      return c.json(c.req.valid('json'), 201)
    })
    expect((await post(app, { title: 'Groceries' })).status).toBe(201)
    const rejected = await post(app, {})
    expect(rejected.status).toBe(400)
    expect((await rejected.json() as { issues: { path: string }[] }).issues[0]?.path).toBe('title')
  })

  it('accepts a Schemastery schema, the one Cordis uses', async () => {
    const app = notes(z.object({ title: z.string().required() }) as StandardSchema<unknown, Note>)
    expect((await post(app, { title: 'Groceries' })).status).toBe(201)
    expect((await post(app, {})).status).toBe(400)
  })

  it('still accepts a { validate }-only object, as the 0.7.0 docs wrote it', async () => {
    const app = notes({
      '~standard': {
        validate: value => typeof (value as Note).title === 'string' ? { value: value as Note } : { issues: [{ message: 'title is required' }] },
      },
    })
    expect((await post(app, { title: 'x' })).status).toBe(201)
    expect(await (await post(app, {})).json()).toEqual({ error: 'invalid json', issues: [{ message: 'title is required', path: '' }] })
  })

  it('rejects an object whose ~standard has a wrong version', () => {
    // @ts-expect-error - the specification's version is 1
    notes({ '~standard': { version: 2, vendor: 'x', validate: () => ({ value: { title: '' } }) } })
  })
})

describe('testClient', () => {
  it('sends the default headers of its options with every request', async () => {
    const app = new Acryl().get('/me', c => c.json({ cookie: c.req.header('cookie') ?? null }))
    const client = testClient(app, undefined, undefined, { headers: { cookie: 'session=abc' } })
    expect(await (await client.me.$get()).json()).toEqual({ cookie: 'session=abc' })
  })
})
