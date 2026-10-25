# Streaming Helper

The Streaming Helper provides methods for streaming responses.

## Import

```ts
import { Acryl } from 'acrylblends'
import { stream, streamText, streamSSE } from 'acrylblends/streaming'
```

## `stream()`

It returns a simple streaming response as `Response` object.

```ts
app.get('/stream', (c) => {
  return stream(c, async (stream) => {
    // Write a process to be executed when aborted.
    stream.onAbort(() => {
      console.log('Aborted!')
    })
    // Write a Uint8Array.
    await stream.write(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]))
    // Pipe a readable stream.
    await stream.pipe(anotherReadableStream)
  })
})
```

## `streamText()`

It returns a streaming response with `Content-Type: text/plain`, `Transfer-Encoding: chunked`, and `X-Content-Type-Options: nosniff` headers.

```ts
app.get('/streamText', (c) => {
  return streamText(c, async (stream) => {
    // Write a text with a new line ('\n').
    await stream.writeln('Hello')
    // Wait 1 second.
    await stream.sleep(1000)
    // Write a text without a new line.
    await stream.write(`Acryl!`)
  })
})
```

**Warning.**

If you are developing an application for Cloudflare Workers, streaming may not work well on Wrangler. If so, add `Identity` for `Content-Encoding` header.

```ts
app.get('/streamText', (c) => {
  c.header('Content-Encoding', 'Identity')
  return streamText(c, async (stream) => {
    // ...
  })
})
```

## `streamSSE()`

It allows you to stream Server-Sent Events (SSE) seamlessly.

```ts
const app = new Acryl()
let id = 0

app.get('/sse', async (c) => {
  return streamSSE(c, async (stream) => {
    while (!stream.aborted) {
      const message = `It is ${new Date().toISOString()}`
      await stream.writeSSE({
        data: message,
        event: 'time-update',
        id: String(id++),
      })
      await stream.sleep(1000)
    }
  })
})
```

## Cancelling work when the client leaves

A reader that closes the tab, loses the network or presses a Stop button should not leave your server working for nobody (a request to a paid model, a database scan). There are two signals, and they are not the same:

- **`c.req.raw.signal`** is the request's `AbortSignal`. It aborts when the client goes away. Pass it to anything that takes a `signal`, such as `fetch`, and the work stops with the client. This is the one to use for cancelling work.
- **`stream.onAbort(callback)`** and **`stream.aborted`** belong to the response stream. They report that the *reader of the response* was cancelled. Measured: when you call `app.request()` with a `signal` and abort it, `c.req.raw.signal` aborts and `stream.aborted` stays `false`; when the reader of the response body is cancelled, `stream.onAbort` fires and `c.req.raw.signal` does not. On a real connection the request signal is what fired when a browser aborted its `fetch`. Use `c.req.raw.signal` for the work, and `stream.onAbort` for cleanup of the stream itself.

An abort event that has already fired does not fire again, so check `signal.aborted` before you wait for it:

```ts
const waitForAbort = (signal: AbortSignal) =>
  signal.aborted
    ? Promise.resolve()
    : new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
```

Keep what you have when the client leaves by saving it in a `finally` block: the stream callback runs to the end whether or not the client is still there.

## Streaming an answer from a model

A chat answer that arrives token by token is a `streamSSE` response that reads a streaming upstream. This server route calls an OpenAI-compatible chat completions API (`stream: true`), forwards each piece as an event, and cancels the upstream request when the client leaves. The key comes from the environment and is never written anywhere.

```ts
import { Acryl } from 'acrylblends'
import { streamSSE } from 'acrylblends/streaming'

/** The pieces of an OpenAI-compatible streaming answer: each `data:` line holds a JSON chunk, and `[DONE]` ends it. */
async function* modelPieces(messages: { role: string; content: string }[], signal: AbortSignal): AsyncGenerator<string> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set')
  const base = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', messages, stream: true }),
    signal,
  })
  if (!response.ok || !response.body) throw new Error(`the model service answered ${response.status}`)
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      const piece = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content
      if (piece) yield piece
    }
  }
}

const app = new Acryl()

app.post('/api/chat', async (c) => {
  const { message } = await c.req.json<{ message: string }>()
  const signal = c.req.raw.signal // aborts when the client goes away
  return streamSSE(c, async (stream) => {
    let answer = ''
    try {
      for await (const piece of modelPieces([{ role: 'user', content: message }], signal)) {
        answer += piece
        // JSON-encode the piece: a piece may contain a newline, which would end an SSE `data:` line.
        await stream.writeSSE({ event: 'token', data: JSON.stringify(piece) })
      }
      await stream.writeSSE({ event: 'done', data: '{}' })
    } catch (error) {
      if (!signal.aborted) await stream.writeSSE({ event: 'error', data: JSON.stringify('The model could not answer.') })
    } finally {
      console.log(`kept ${answer.length} characters`) // save what arrived, also when the client pressed Stop
    }
  })
})
```

## Reading a POST event stream in the browser

`EventSource` can only send a GET request. For a POST (a chat message), read the response body yourself; this function calls `on` for each event as it arrives:

```ts
async function readEvents(body: ReadableStream<Uint8Array>, on: (event: string, data: string) => void): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    // Line endings may be CRLF; a \r at the end of a chunk is completed by the next chunk, so normalise the whole buffer.
    buffer = (buffer + decoder.decode(value, { stream: true })).replaceAll('\r\n', '\n')
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, '')) // the SSE spec strips one leading space only
      }
      on(event, data.join('\n'))
    }
  }
}

const controller = new AbortController() // controller.abort() is the Stop button
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' }),
  signal: controller.signal,
})
let answer = ''
await readEvents(response.body!, (event, data) => {
  if (event === 'token') answer += JSON.parse(data) as string
})
```

A complete chat component built on this is in the `chat` template of `create-acrylblends` (`npm create acrylblends@latest my-chat -- --template chat`).

## Error Handling

The third argument of the streaming helper is an error handler.
This argument is optional, if you don't specify it, the error will be output as a console error.

```ts
app.get('/stream', (c) => {
  return stream(
    c,
    async (stream) => {
      // Write a process to be executed when aborted.
      stream.onAbort(() => {
        console.log('Aborted!')
      })
      // Write a Uint8Array.
      await stream.write(
        new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f])
      )
      // Pipe a readable stream.
      await stream.pipe(anotherReadableStream)
    },
    (err, stream) => {
      stream.writeln('An error occurred!')
      console.error(err)
    }
  )
})
```

The stream will be automatically closed after the callbacks are executed.

> **Warning.**
> If the callback function of the streaming helper throws an error, the `onError` event of Acryl will not be triggered.
>
> `onError` is a hook to handle errors before the response is sent and overwrite the response. However, when the callback function is executed, the stream has already started, so it cannot be overwritten.
>
