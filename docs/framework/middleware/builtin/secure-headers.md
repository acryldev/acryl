# Secure Headers Middleware

Secure Headers Middleware simplifies the setup of security headers. Inspired in part by the capabilities of Helmet, it allows you to control the activation and deactivation of specific security headers.

## Import

```ts
import { Acryl } from 'acrylblends'
import { secureHeaders } from 'acrylblends/secure-headers'
```

## Usage

You can use the optimal settings by default.

```ts
const app = new Acryl()
app.use(secureHeaders())
```

You can suppress unnecessary headers by setting them to false.

```ts
const app = new Acryl()
app.use(
  '*',
  secureHeaders({
    xFrameOptions: false,
    xXssProtection: false,
  })
)
```

You can override default header values using a string.

```ts
const app = new Acryl()
app.use(
  '*',
  secureHeaders({
    strictTransportSecurity:
      'max-age=63072000; includeSubDomains; preload',
    xFrameOptions: 'DENY',
    xXssProtection: '1',
  })
)
```

## Supported Options

Each option corresponds to the following Header Key-Value pairs.

| Option                          | Header                                                                                                                                         | Value                                                                      | Default    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| -                               | X-Powered-By                                                                                                                                   | (Delete Header)                                                            | True       |
| contentSecurityPolicy           | [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)                                                               | Usage: [Setting Content-Security-Policy](#setting-content-security-policy) | No Setting |
| contentSecurityPolicyReportOnly | [Content-Security-Policy-Report-Only](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy-Report-Only)           | Usage: [Setting Content-Security-Policy](#setting-content-security-policy) | No Setting |
| trustedTypes                    | [Trusted Types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/trusted-types)                               | Usage: [Setting Content-Security-Policy](#setting-content-security-policy) | No Setting |
| requireTrustedTypesFor          | [Require Trusted Types For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/require-trusted-types-for)       | Usage: [Setting Content-Security-Policy](#setting-content-security-policy) | No Setting |
| crossOriginEmbedderPolicy       | [Cross-Origin-Embedder-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)                         | require-corp                                                               | **False**  |
| crossOriginResourcePolicy       | [Cross-Origin-Resource-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Resource-Policy)                         | same-origin                                                                | True       |
| crossOriginOpenerPolicy         | [Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy)                             | same-origin                                                                | True       |
| originAgentCluster              | [Origin-Agent-Cluster](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin-Agent-Cluster)                                         | ?1                                                                         | True       |
| referrerPolicy                  | [Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy)                                                   | no-referrer                                                                | True       |
| reportingEndpoints              | [Reporting-Endpoints](https://www.w3.org/TR/reporting-1/#header)                                                                               | Usage: [Setting Content-Security-Policy](#setting-content-security-policy) | No Setting |
| reportTo                        | [Report-To](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-to)                                       | Usage: [Setting Content-Security-Policy](#setting-content-security-policy) | No Setting |
| strictTransportSecurity         | [Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)                               | max-age=15552000; includeSubDomains                                        | True       |
| xContentTypeOptions             | [X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options)                                     | nosniff                                                                    | True       |
| xDnsPrefetchControl             | [X-DNS-Prefetch-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-DNS-Prefetch-Control)                                     | off                                                                        | True       |
| xDownloadOptions                | [X-Download-Options](https://learn.microsoft.com/en-us/archive/blogs/ie/ie8-security-part-v-comprehensive-protection#mime-handling-force-save) | noopen                                                                     | True       |
| xFrameOptions                   | [X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options)                                                   | SAMEORIGIN                                                                 | True       |
| xPermittedCrossDomainPolicies   | [X-Permitted-Cross-Domain-Policies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Permitted-Cross-Domain-Policies)               | none                                                                       | True       |
| xXssProtection                  | [X-XSS-Protection](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-XSS-Protection)                                                 | 0                                                                          | True       |
| permissionPolicy                | [Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy)                                             | Usage: [Setting Permission-Policy](#setting-permission-policy)             | No Setting |

## Middleware Conflict

Please be cautious about the order of specification when dealing with middleware that manipulates the same header.

In this case, Secure-headers operates and the `x-powered-by` is removed:

```ts
const app = new Acryl()
app.use(secureHeaders())
app.use(poweredBy())
```

In this case, Powered-By operates and the `x-powered-by` is added:

```ts
const app = new Acryl()
app.use(poweredBy())
app.use(secureHeaders())
```

## Setting Content-Security-Policy

```ts
const app = new Acryl()
app.use(
  '/test',
  secureHeaders({
    reportingEndpoints: [
      {
        name: 'endpoint-1',
        url: 'https://example.com/reports',
      },
    ],
    // -- or alternatively
    // reportTo: [
    //   {
    //     group: 'endpoint-1',
    //     max_age: 10886400,
    //     endpoints: [{ url: 'https://example.com/reports' }],
    //   },
    // ],
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      childSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      manifestSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      reportTo: 'endpoint-1',
      reportUri: '/csp-report',
      sandbox: ['allow-same-origin', 'allow-scripts'],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      scriptSrcElem: ["'self'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      styleSrcAttr: ['none'],
      styleSrcElem: ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
      workerSrc: ["'self'"],
    },
  })
)
```

### `nonce` attribute

You can add a [`nonce` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/nonce) to a `script` or `style` element by adding the `NONCE` imported from `acrylblends/secure-headers` to a `scriptSrc` or `styleSrc`:

```tsx
import { secureHeaders, NONCE } from 'acrylblends/secure-headers'
import type { SecureHeadersVariables } from 'acrylblends/secure-headers'

// Specify the variable types to infer the `c.get('secureHeadersNonce')`:
type Variables = SecureHeadersVariables

const app = new Acryl<{ Variables: Variables }>()

// Set the pre-defined nonce value to `scriptSrc`:
app.get(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      scriptSrc: [NONCE, 'https://allowed1.example.com'],
    },
  })
)

// Get the value from `c.get('secureHeadersNonce')`:
app.get('/', (c) => {
  return c.html(
    <html>
      <body>
        {/** contents */}
        <script
          src='/js/client.js'
          nonce={c.get('secureHeadersNonce')}
        />
      </body>
    </html>
  )
})
```

If you want to generate the nonce value yourself, you can also specify a function as the following:

```tsx
const app = new Acryl<{
  Variables: { myNonce: string }
}>()

const myNonceGenerator: ContentSecurityPolicyOptionHandler = (c) => {
  // This function is called on every request.
  const nonce = Math.random().toString(36).slice(2)
  c.set('myNonce', nonce)
  return `'nonce-${nonce}'`
}

app.get(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      scriptSrc: [myNonceGenerator, 'https://allowed1.example.com'],
    },
  })
)

app.get('/', (c) => {
  return c.html(
    <html>
      <body>
        {/** contents */}
        <script src='/js/client.js' nonce={c.get('myNonce')} />
      </body>
    </html>
  )
})
```

## Setting Permission-Policy

The Permission-Policy header allows you to control which features and APIs can be used in the browser. Here's an example of how to set it:

```ts
const app = new Acryl()
app.use(
  '*',
  secureHeaders({
    permissionsPolicy: {
      fullscreen: ['self'], // fullscreen=(self)
      bluetooth: ['none'], // bluetooth=(none)
      payment: ['self', 'https://example.com'], // payment=(self "https://example.com")
      syncXhr: [], // sync-xhr=()
      camera: false, // camera=none
      microphone: true, // microphone=*
      geolocation: ['*'], // geolocation=*
      usb: ['self', 'https://a.example.com', 'https://b.example.com'], // usb=(self "https://a.example.com" "https://b.example.com")
      accelerometer: ['https://*.example.com'], // accelerometer=("https://*.example.com")
      gyroscope: ['src'], // gyroscope=(src)
      magnetometer: [
        'https://a.example.com',
        'https://b.example.com',
      ], // magnetometer=("https://a.example.com" "https://b.example.com")
    },
  })
)
```
