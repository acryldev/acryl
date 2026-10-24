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
