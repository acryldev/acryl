# AWS Lambda

An Acryl app runs on AWS Lambda behind API Gateway (REST API and HTTP API), an Application Load Balancer, a Lambda Function URL or VPC Lattice. `handle(app)` from `acrylblends/aws-lambda` turns the app into the Lambda handler: it builds a `Request` from the event, calls `app.fetch`, and returns the result in the shape the event source expects.

> **Status.** The adapter is the upstream adapter ported with its test suite, and the framework's release check calls it with API Gateway v1 and v2 and ALB events. It has not been deployed to an AWS account by the ACRYL team: try your first deploy with a test stage.

## Install and write the handler

```sh
npm install acrylblends
```

```ts
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/aws-lambda'

const app = new Acryl()

app.get('/', (c) => c.text('Hello from Lambda'))
app.get('/json', (c) => c.json({ message: 'Hello JSON' }))

export const handler = handle(app)
```

Bundle the file to one JavaScript file for the `nodejs22.x` (or newer) runtime with your tool of choice (esbuild is common), upload it, and set the handler to `index.handler` (the file name, a dot, the export).

## The event and the Lambda context

Both are in the bindings of the request:

```ts
import { Acryl } from 'acrylblends'
import type { LambdaContext, LambdaEvent } from 'acrylblends/aws-lambda'

type Bindings = {
  event: LambdaEvent
  lambdaContext: LambdaContext
}

const app = new Acryl<{ Bindings: Bindings }>()

app.get('/info', (c) => {
  return c.json({
    isBase64Encoded: c.env.event.isBase64Encoded,
    awsRequestId: c.env.lambdaContext.awsRequestId,
  })
})
```

`c.env.requestContext` holds the request context of the event (API Gateway, ALB or Lattice). The client's address is available through the [ConnInfo helper](../helpers/conninfo.md): `getConnInfo(c).remote.address`.

## Binary responses

A response is returned base64 encoded when its content type is binary (images, audio, video, PDF, archives and other non-text types) or it has a content encoding such as `gzip`. To decide differently, pass `isContentTypeBinary`:

```ts
import { Acryl } from 'acrylblends'
import { defaultIsContentTypeBinary, handle } from 'acrylblends/aws-lambda'

const app = new Acryl()

export const handler = handle(app, {
  isContentTypeBinary: (contentType) =>
    defaultIsContentTypeBinary(contentType) || contentType.startsWith('application/vnd.api+octet'),
})
```

## Response streaming

On a Function URL with `RESPONSE_STREAM` invoke mode, use `streamHandle` instead of `handle`: the body is written to the response stream as the app produces it, so [streaming helpers](../helpers/streaming.md) (SSE, `stream`, `streamText`) reach the client as they are written. It needs the `awslambda` global, which only the Lambda runtime provides.

```ts
import { Acryl } from 'acrylblends'
import { streamHandle } from 'acrylblends/aws-lambda'

const app = new Acryl()

export const handler = streamHandle(app)
```

## Try it without AWS

A handler is a function from an event to a result, so it can be called locally with a sample event:

```ts
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/aws-lambda'

const app = new Acryl().get('/', (c) => c.text('Hello from Lambda'))

const result = await handle(app)({
  version: '2.0',
  routeKey: '$default',
  rawPath: '/',
  rawQueryString: '',
  headers: { host: 'example.execute-api.eu-west-1.amazonaws.com' },
  requestContext: {
    accountId: '1',
    apiId: 'example',
    authentication: null,
    authorizer: {},
    domainName: 'example.execute-api.eu-west-1.amazonaws.com',
    domainPrefix: 'example',
    http: { method: 'GET', path: '/', protocol: 'HTTP/1.1', sourceIp: '203.0.113.9', userAgent: 'test' },
    requestId: 'r',
    routeKey: '$default',
    stage: '$default',
    time: '25/Oct/2026:12:00:00 +0000',
    timeEpoch: 0,
  },
  body: null,
  isBase64Encoded: false,
})
console.log(result.statusCode, result.body) // 200 Hello from Lambda
```
