import type { Db } from '../plugins/acryl-db/src/index.ts'
import {
  type StandardSchema,
  schemaValidator,
  streamSSE,
} from '../plugins/acryl-router/src/helpers/index.ts'
import { Acryl } from '../plugins/acryl-router/src/index.ts'
import { type Access, accessGate } from './access.ts'
import { chatStore } from './db.ts'
import { type Llm, MissingKey, openAiCompatible } from './llm.ts'
import { chatPage } from './page.tsx'

interface ChatInput {
  message: string
  conversation?: number
}

const ChatSchema: StandardSchema<ChatInput> = {
  '~standard': {
    validate: (value) => {
      const input = (value ?? {}) as Record<string, unknown>
      const message = typeof input.message === 'string' ? input.message.trim() : ''
      const issues = []
      if (message === '') issues.push({ message: 'Write a message.', path: ['message'] })
      else if (message.length > 4000)
        issues.push({ message: 'The message is at most 4000 characters.', path: ['message'] })
      if (input.conversation !== undefined && !Number.isInteger(input.conversation))
        issues.push({ message: 'The conversation is a number.', path: ['conversation'] })
      return issues.length > 0
        ? { issues }
        : { value: { message, conversation: input.conversation as number | undefined } }
    },
  },
}

/**
 * `access` is who may use the chat (default: anyone, as in development and in the tests); see `src/access.ts`. `prefix` is the path the app is mounted at:
 * '' on its own server, `/app` in the ACRYL frame. Every URL the page writes is derived from it.
 */
export function createApp(
  db: Db,
  llm: Llm = openAiCompatible,
  access: Access = { kind: 'open' },
  { prefix = '' }: { prefix?: string } = {},
) {
  const store = chatStore(db)
  const app = new Acryl()
  const gate = accessGate(access)
  if (gate) app.use(gate)

  app.get('/health', (c) => c.json({ ok: true }))

  app.get('/', async (c) => {
    const id = Number(c.req.query('c'))
    const current = Number.isInteger(id) ? await store.conversation(id) : undefined
    return c.html(
      chatPage(
        await store.conversations(),
        current,
        current ? await store.messages(current.id) : [],
        prefix,
      ),
    )
  })

  app.get('/api/conversations', async (c) => c.json({ conversations: await store.conversations() }))
  app.get('/api/conversations/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const conversation = await store.conversation(id)
    return conversation
      ? c.json({ conversation, messages: await store.messages(id) })
      : c.json({ error: 'No such conversation.' }, 404)
  })
  app.delete('/api/conversations/:id', async (c) =>
    (await store.remove(Number(c.req.param('id'))))
      ? c.json({ ok: true })
      : c.json({ error: 'No such conversation.' }, 404),
  )

  // The answer streams as Server-Sent Events: `meta` (the conversation id), then one `token` per piece, then `done`, or `error`.
  // The request's signal aborts when the client goes away (the Stop button, a closed tab); it is passed to the model call so the upstream request stops too.
  app.post('/api/chat', schemaValidator('json', ChatSchema), async (c) => {
    const { message, conversation } = c.req.valid('json')
    const known = conversation === undefined ? undefined : await store.conversation(conversation)
    if (conversation !== undefined && !known) return c.json({ error: 'No such conversation.' }, 404)
    const id = known?.id ?? (await store.start(message))
    await store.add(id, 'user', message)
    const history = (await store.messages(id)).map(({ role, content }) => ({ role, content }))
    const signal = c.req.raw.signal
    return streamSSE(c, async (stream) => {
      let answer = ''
      await stream.writeSSE({ event: 'meta', data: JSON.stringify({ conversation: id }) })
      try {
        for await (const piece of llm(history, signal)) {
          answer += piece
          await stream.writeSSE({ event: 'token', data: JSON.stringify(piece) })
        }
        await stream.writeSSE({ event: 'done', data: '{}' })
      } catch (error) {
        if (!signal.aborted) {
          console.error(error)
          // The reason stays in the log; the page gets a plain message, or how to set the missing key.
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify(
              error instanceof MissingKey
                ? error.message
                : 'The model could not answer. Try again.',
            ),
          })
        }
      } finally {
        // What arrived is kept, also when the reader pressed Stop.
        if (answer !== '') await store.add(id, 'assistant', answer)
      }
    })
  })

  return app
}
