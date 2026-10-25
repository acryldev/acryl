# Lambda@Edge

An Acryl app can answer CloudFront requests from Lambda@Edge. `handle(app)` from `acrylblends/lambda-edge` turns the app into the edge function: it builds a `Request` from the CloudFront event, calls `app.fetch`, and returns a CloudFront response. A viewer-request or origin-request function that answers by itself (a redirect, an HTML page, a JSON answer) is the typical use.

> **Status.** The adapter is the upstream adapter ported with its test suite, and the framework's release check calls it with a CloudFront viewer-request event. It has not been deployed to AWS by the ACRYL team.

```ts
import { Acryl } from 'acrylblends'
import { handle } from 'acrylblends/lambda-edge'

const app = new Acryl()

app.get('/', (c) => c.text('Hello from the edge'))

export const handler = handle(app)
```

Lambda@Edge has its own limits: the function must be created in `us-east-1`, has no environment variables, and its size and time limits are lower than Lambda's; check them in the AWS documentation when you choose between this adapter and [AWS Lambda](aws-lambda.md).

## The CloudFront event

The CloudFront request, response and config are in the bindings:

```ts
import { Acryl } from 'acrylblends'
import type { Callback, CloudFrontEdgeEvent } from 'acrylblends/lambda-edge'

type Bindings = {
  callback: Callback
  event: CloudFrontEdgeEvent
}

const app = new Acryl<{ Bindings: Bindings }>()

app.get('/country', (c) => {
  const request = c.env.event.Records[0].cf.request
  return c.json({ uri: request.uri, clientIp: request.clientIp })
})
```

The client's address is available through the [ConnInfo helper](../helpers/conninfo.md).
