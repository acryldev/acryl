# JSX

You can write HTML with JSX syntax with `acrylblends/jsx`.

Although `acrylblends/jsx` works on the client, you will probably use it most often when rendering content on the server side. Here are some things related to JSX that are common to both server and client.

## Settings

To use JSX, modify the `tsconfig.json`:

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "acrylblends/jsx"
  }
}
```

Alternatively, use the pragma directives:

```ts
/** @jsx jsx */
/** @jsxImportSource acrylblends/jsx */
```

## Run `.tsx` on Node.js

Node.js strips TypeScript's types but does not compile JSX, so a `.tsx` file needs one flag: `--import acrylblends/node-server/register`.
It compiles each `.tsx` (and `.jsx`) module as Node.js loads it, with your app's own `typescript` (a development dependency) and the
`jsxImportSource` of your `tsconfig.json` (`acrylblends/jsx` without one); every other module runs exactly as before. Stack traces point at
the `.tsx` lines.

`package.json`:

```json
{
  "scripts": {
    "dev": "node --watch --import acrylblends/node-server/register src/index.tsx",
    "start": "node --import acrylblends/node-server/register src/index.tsx",
    "test": "node --import acrylblends/node-server/register --test \"src/**/*.test.{ts,tsx}\""
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

`node --test` looks only for `.js` and `.ts` test files on its own, so the `test` script names the `.tsx` ones with a pattern. Without `typescript` in the app, the first `.tsx` module stops with a message that says to install it. Bun compiles JSX itself and needs
no flag.

## Usage

> **Note.** If you are coming straight from the [Quick Start](../README.md#quick-start), the main file has a `.ts` extension - you need to change it to `.tsx` - otherwise you will not be able to run the application at all. Change the scripts in `package.json` to match: on Node.js, as [above](#run-tsx-on-nodejs); on Bun, `bun run --hot src/index.tsx` instead of `bun run --hot src/index.ts`.

`index.tsx`:

```tsx
import { Acryl } from 'acrylblends'
import type { FC } from 'acrylblends/jsx'

const app = new Acryl()

const Layout: FC = (props) => {
  return (
    <html>
      <body>{props.children}</body>
    </html>
  )
}

const Top: FC<{ messages: string[] }> = (props: {
  messages: string[]
}) => {
  return (
    <Layout>
      <h1>Acryl!</h1>
      <ul>
        {props.messages.map((message) => {
          return <li>{message}!!</li>
        })}
      </ul>
    </Layout>
  )
}

app.get('/', (c) => {
  const messages = ['Good Morning', 'Good Evening', 'Good Night']
  return c.html(<Top messages={messages} />)
})

export default app
```

## Without compiling: `jsx()`

A `.ts` file can build the same nodes without JSX syntax and without the register flag: write the call that JSX compiles to.
`jsx(tag, props, ...children)` takes the children after the props, and a node renders with `toString()`. The `` html`...` `` template
from `acrylblends/html` is the other build-free choice.

```ts
import { Acryl } from 'acrylblends'
import { jsx } from 'acrylblends/jsx'
import type { PropsWithChildren } from 'acrylblends/jsx'

const Layout = (props: PropsWithChildren<{ title: string }>) =>
  jsx('html', { lang: 'en' }, jsx('head', null, jsx('title', null, props.title)), jsx('body', null, props.children))

const About = () =>
  jsx(Layout, { title: 'About' }, jsx('h1', null, 'About'), jsx('p', { class: 'lead' }, 'Rendered on the server.'))

const app = new Acryl()
app.get('/about', (c) => c.html(jsx(About, null).toString()))

export default app
```

Pass the children as arguments after the props. A `children` entry inside the props object is not rendered by this form.

## Metadata hoisting

You can write document metadata tags such as `<title>`, `<link>`, and `<meta>` directly inside your components. These tags will be automatically hoisted to the `<head>` section of the document. This is especially useful when the `<head>` element is rendered far from the component that determines the appropriate metadata.

```tsx
import { Acryl } from 'acrylblends'

const app = new Acryl()

app.use('*', async (c, next) => {
  c.setRenderer((content) => {
    return c.html(
      <html>
        <head></head>
        <body>{content}</body>
      </html>
    )
  })
  await next()
})

app.get('/about', (c) => {
  return c.render(
    <>
      <title>About Page</title>
      <meta name='description' content='This is the about page.' />
      about page content
    </>
  )
})

export default app
```

> **Note.** When hoisting occurs, existing elements are not removed. Elements appearing later are added to the end. For example, if you have `<title>Default</title>` in your `<head>` and a component renders `<title>Page Title</title>`, both titles will appear in the head.

## Fragment

Use Fragment to group multiple elements without adding extra nodes:

```tsx
import { Fragment } from 'acrylblends/jsx'

const List = () => (
  <Fragment>
    <p>first child</p>
    <p>second child</p>
    <p>third child</p>
  </Fragment>
)
```

Or you can write it with `<></>` if it sets up properly.

```tsx
const List = () => (
  <>
    <p>first child</p>
    <p>second child</p>
    <p>third child</p>
  </>
)
```

## `PropsWithChildren`

You can use `PropsWithChildren` to correctly infer a child element in a function component.

```tsx
import { PropsWithChildren } from 'acrylblends/jsx'

type Post = {
  id: number
  title: string
}

function Component({ title, children }: PropsWithChildren<Post>) {
  return (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  )
}
```

## Inserting Raw HTML

To directly insert HTML, use `dangerouslySetInnerHTML`:

```tsx
app.get('/foo', (c) => {
  const inner = { __html: 'JSX &middot; SSR' }
  const Div = <div dangerouslySetInnerHTML={inner} />
})
```

## Memoization

Optimize your components by memoizing computed strings using `memo`:

```tsx
import { memo } from 'acrylblends/jsx'

const Header = memo(() => <header>Welcome to Acryl</header>)
const Footer = memo(() => <footer>Powered by Acryl</footer>)
const Layout = (
  <div>
    <Header />
    <p>Acryl is cool!</p>
    <Footer />
  </div>
)
```

## Context

By using `useContext`, you can share data globally across any level of the Component tree without passing values through props.

```tsx
import type { FC } from 'acrylblends/jsx'
import { createContext, useContext } from 'acrylblends/jsx'

const themes = {
  light: {
    color: '#000000',
    background: '#eeeeee',
  },
  dark: {
    color: '#ffffff',
    background: '#222222',
  },
}

const ThemeContext = createContext(themes.light)

const Button: FC = () => {
  const theme = useContext(ThemeContext)
  return <button style={theme}>Push!</button>
}

const Toolbar: FC = () => {
  return (
    <div>
      <Button />
    </div>
  )
}

// ...

app.get('/', (c) => {
  return c.html(
    <div>
      <ThemeContext.Provider value={themes.dark}>
        <Toolbar />
      </ThemeContext.Provider>
    </div>
  )
})
```

## Async Component

`acrylblends/jsx` supports an Async Component, so you can use `async`/`await` in your component.
If you render it with `c.html()`, it will await automatically.

```tsx
const AsyncComponent = async () => {
  await new Promise((r) => setTimeout(r, 1000)) // sleep 1s
  return <div>Done!</div>
}

app.get('/', (c) => {
  return c.html(
    <html>
      <body>
        <AsyncComponent />
      </body>
    </html>
  )
})
```

## Suspense *(Experimental)*

The React-like `Suspense` feature is available.
If you wrap the async component with `Suspense`, the content in the fallback will be rendered first, and once the Promise is resolved, the awaited content will be displayed.
You can use it with `renderToReadableStream()`.

```tsx
import { renderToReadableStream, Suspense } from 'acrylblends/jsx/streaming'

//...

app.get('/', (c) => {
  const stream = renderToReadableStream(
    <html>
      <body>
        <Suspense fallback={<div>loading...</div>}>
          <Component />
        </Suspense>
      </body>
    </html>
  )
  return c.body(stream, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Transfer-Encoding': 'chunked',
    },
  })
})
```

## ErrorBoundary *(Experimental)*

You can catch errors in child components using `ErrorBoundary`.

In the example below, it will show the content specified in `fallback` if an error occurs.

```tsx
function SyncComponent() {
  throw new Error('Error')
  return <div>Hello</div>
}

app.get('/sync', async (c) => {
  return c.html(
    <html>
      <body>
        <ErrorBoundary fallback={<div>Out of Service</div>}>
          <SyncComponent />
        </ErrorBoundary>
      </body>
    </html>
  )
})
```

`ErrorBoundary` can also be used with async components and `Suspense`.

```tsx
async function AsyncComponent() {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  throw new Error('Error')
  return <div>Hello</div>
}

app.get('/with-suspense', async (c) => {
  return c.html(
    <html>
      <body>
        <ErrorBoundary fallback={<div>Out of Service</div>}>
          <Suspense fallback={<div>Loading...</div>}>
            <AsyncComponent />
          </Suspense>
        </ErrorBoundary>
      </body>
    </html>
  )
})
```

## StreamingContext *(Experimental)*

You can use `StreamingContext` to provide configuration for streaming components like `Suspense` and `ErrorBoundary`. This is useful for adding nonce values to script tags generated by these components for Content Security Policy (CSP).

```tsx
import { Suspense, StreamingContext } from 'acrylblends/jsx/streaming'

// ...

app.get('/', (c) => {
  const stream = renderToReadableStream(
    <html>
      <body>
        <StreamingContext
          value={{ scriptNonce: 'random-nonce-value' }}
        >
          <Suspense fallback={<div>Loading...</div>}>
            <AsyncComponent />
          </Suspense>
        </StreamingContext>
      </body>
    </html>
  )

  return c.body(stream, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Transfer-Encoding': 'chunked',
      'Content-Security-Policy':
        "script-src 'nonce-random-nonce-value'",
    },
  })
})
```

The `scriptNonce` value will be automatically added to any `<script>` tags generated by `Suspense` and `ErrorBoundary` components.

## Integration with html Middleware

Combine the JSX and HTML middlewares for powerful templating.
For in-depth details, consult the [HTML middleware documentation](../helpers/html.md).

```tsx
import { Acryl } from 'acrylblends'
import { html } from 'acrylblends/html'

const app = new Acryl()

interface SiteData {
  title: string
  children?: any
}

const Layout = (props: SiteData) =>
  html`<!doctype html>
    <html>
      <head>
        <title>${props.title}</title>
      </head>
      <body>
        ${props.children}
      </body>
    </html>`

const Content = (props: { siteData: SiteData; name: string }) => (
  <Layout {...props.siteData}>
    <h1>Hello {props.name}</h1>
  </Layout>
)

app.get('/:name', (c) => {
  const { name } = c.req.param()
  const props = {
    name: name,
    siteData: {
      title: 'JSX with html sample',
    },
  }
  return c.html(<Content {...props} />)
})

export default app
```

## With JSX Renderer Middleware

The [JSX Renderer Middleware](../middleware/builtin/jsx-renderer.md) allows you to create HTML pages more easily with the JSX.

## Override type definitions

You can override the type definition to add your custom elements and attributes.

```ts
declare module 'acrylblends/jsx' {
  namespace JSX {
    interface IntrinsicElements {
      'my-custom-element': HTMLAttributes & {
        'x-event'?: 'click' | 'scroll'
      }
    }
  }
}
```
