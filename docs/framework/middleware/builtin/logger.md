# Logger Middleware

It's a simple logger.

## Import

```ts
import { Acryl } from 'acrylblends'
import { logger } from 'acrylblends/logger'
```

## Usage

```ts
const app = new Acryl()

app.use(logger())
app.get('/', (c) => c.text('Acryl!'))
```

## Logging Details

The Logger Middleware logs the following details for each request:

- **Incoming Request**: Logs the HTTP method, request path, and incoming request.
- **Outgoing Response**: Logs the HTTP method, request path, response status code, and request/response times.
- **Status Code Coloring**: Response status codes are color-coded for better visibility and quick identification of status categories. Different status code categories are represented by different colors.
- **Elapsed Time**: The time taken for the request/response cycle is logged in a human-readable format, either in milliseconds (ms) or seconds (s).

By using the Logger Middleware, you can easily monitor the flow of requests and responses in your Acryl application and quickly identify any issues or performance bottlenecks.

You can also extend the middleware further by providing your own `PrintFunc` function for tailored logging behavior.

> **Tip.**
> To disable _status code coloring_, you can set a `NO_COLOR` environment variable. This is a common way to disable ANSI color escape codes in logging libraries, and is described at <https://no-color.org/>. Note that Cloudflare Workers do not have a `process.env` object, so will default to plaintext log output.

## PrintFunc

The Logger Middleware accepts an optional `PrintFunc` function as a parameter. This function allows you to customize the logger and add additional logs.

## Options

### *(optional)* fn: `PrintFunc(str: string, ...rest: string[])`

- `str`: Passed by the logger.
- `...rest`: Additional string props to be printed to console.

### Example

Setting up a custom `PrintFunc` function to the Logger Middleware:

```ts
export const customLogger = (message: string, ...rest: string[]) => {
  console.log(message, ...rest)
}

app.use(logger(customLogger))
```

Setting up the custom logger in a route:

```ts
app.post('/blog', (c) => {
  // Routing logic

  customLogger('Blog saved:', `Path: ${blog.url},`, `ID: ${blog.id}`)
  // Output
  // <-- POST /blog
  // Blog saved: Path: /blog/example, ID: 1
  // --> POST /blog 201 93ms

  // Return Context
})
```
