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

A proxy or a host that compresses the response body can hold a stream back until it ends. If a stream arrives only when it is complete, send `Content-Encoding: Identity` for that route.

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
- **`stream.onAbort(callback)`** and **`stream.aborted`** belong to the response stream. They report that the *reader of the response* was cancelled, and they are set when the response body is cancelled, which is what the Node adapter does when the connection closes. Over a real connection, a browser that aborts its `fetch` (or closes the tab) fires both: the request signal and `stream.onAbort`. Under `app.request()` (in-process, no socket) they come apart, and this is how the upstream behaves too: aborting the `signal` you passed to `app.request()` fires `c.req.raw.signal` while `stream.aborted` stays `false`, and cancelling the reader of the response body fires `stream.onAbort` while `c.req.raw.signal` does not. A test that simulates the client leaving therefore aborts the request signal (for work cancelled through the signal) or cancels the body reader (for `stream.onAbort`), whichever the handler listens to. Use `c.req.raw.signal` for the work, and `stream.onAbort` for cleanup of the stream itself.

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

`EventSource` can only send a GET request. For a POST (a chat message), call `fetch` and read the events with `readSSE` from `acrylblends/read-sse`. It is an async iterator over the events of a `text/event-stream` response, parsed by the rules of the SSE standard (LF, CRLF and CR line ends, several `data` lines joined with a line feed, comments, UTF-8 split across chunks):

```ts
import { readSSE } from 'acrylblends/read-sse'

const controller = new AbortController() // controller.abort() is the Stop button
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' }),
  signal: controller.signal,
})

let answer = ''
for await (const { event, data } of readSSE(response)) {
  if (event === 'token') answer += JSON.parse(data) as string
}
```

- Each event is `{ event, data, id?, retry? }`; `event` is `message` when the server named none, and `data` is a string (parse it yourself when the server sends JSON).
- Leaving the loop early (a `break`, a thrown error) cancels the response body, so the request to the server ends. Abort the `fetch` with its own `signal` for a Stop button; `readSSE(response, { signal })` also stops reading when a signal aborts.
- A response that is not `ok` throws with its status (the body is not parsed as events), and a response without a body throws.
- A client module served by `clientModules` can import it as it is (`import { readSSE } from 'acrylblends/read-sse'`): the import is pointed at a browser file the same app serves, like `acrylblends/client`. With a bundler it is an ordinary import.

A complete chat component is in the `chat` template of `create-acrylblends` (`npm create acrylblends@latest my-chat -- --template chat`).

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
