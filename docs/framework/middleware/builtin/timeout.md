# Timeout Middleware

The Timeout Middleware enables you to easily manage request timeouts in your application. It allows you to set a maximum duration for requests and optionally define custom error responses if the specified timeout is exceeded.

## Import

```ts
import { Acryl } from 'acrylblends'
import { timeout } from 'acrylblends/timeout'
```

## Usage

Here's how to use the Timeout Middleware with both default and custom settings:

Default Settings:

```ts
const app = new Acryl()

// Applying a 5-second timeout
app.use('/api', timeout(5000))

// Handling a route
app.get('/api/data', async (c) => {
  // Your route handler logic
  return c.json({ data: 'Your data here' })
})
```

Custom settings:

```ts
import { HTTPException } from 'acrylblends/http-exception'

// Custom exception factory function
const customTimeoutException = (context) =>
  new HTTPException(408, {
    message: `Request timeout after waiting ${context.req.headers.get(
      'Duration'
    )} seconds. Please try again later.`,
  })

// for Static Exception Message
// const customTimeoutException = new HTTPException(408, {
//   message: 'Operation timed out. Please try again later.'
// });

// Applying a 1-minute timeout with a custom exception
app.use('/api/long-process', timeout(60000, customTimeoutException))

app.get('/api/long-process', async (c) => {
  // Simulate a long process
  await new Promise((resolve) => setTimeout(resolve, 61000))
  return c.json({ data: 'This usually takes longer' })
})
```

## Notes

- The duration for the timeout can be specified in milliseconds. The middleware will automatically reject the promise and potentially throw an error if the specified duration is exceeded.

- The timeout middleware cannot be used with stream Thus, use `stream.close` and `setTimeout` together.

```ts
app.get('/sse', async (c) => {
  let id = 0
  let running = true
  let timer: number | undefined

  return streamSSE(c, async (stream) => {
    timer = setTimeout(() => {
      console.log('Stream timeout reached, closing stream')
      stream.close()
    }, 3000) as unknown as number

    stream.onAbort(async () => {
      console.log('Client closed connection')
      running = false
      clearTimeout(timer)
    })

    while (running) {
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

## Middleware Conflicts

Be cautious about the order of middleware, especially when using error-handling or other timing-related middleware, as it might affect the behavior of this timeout middleware.
