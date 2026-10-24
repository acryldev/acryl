# css Helper

> **Not yet available.** The CSS helper (`acrylblends/css`) is documented here so the page structure matches the rest of the framework, and is not part of acrylblends yet. The code on this page is not checked by the docs tests.


The CSS helper - `acrylblends/css` - is Acryl's built-in CSS in JS(X).

You can write CSS in JSX in a JavaScript template literal named `css`. The return value of `css` will be the class name, which is set to the value of the class attribute. The `<Style />` component will then contain the value of the CSS.

## Import

```ts
import { Acryl } from 'acrylblends'
import { css, cx, keyframes, Style, createCssContext } from 'acrylblends/css'
```

## `css` *(Experimental)*

You can write CSS in the `css` template literal. In this case, it uses `headerClass` as a value of the `class` attribute. Don't forget to add `<Style />` as it contains the CSS content.

```ts
app.get('/', (c) => {
  const headerClass = css`
    background-color: orange;
    color: white;
    padding: 1rem;
  `
  return c.html(
    <html>
      <head>
        <Style />
      </head>
      <body>
        <h1 class={headerClass}>Hello!</h1>
      </body>
    </html>
  )
})
```

You can style pseudo-classes like `:hover` by using the [nesting selector](https://developer.mozilla.org/en-US/docs/Web/CSS/Nesting_selector), `&`:

```ts
const buttonClass = css`
  background-color: #fff;
  &:hover {
    background-color: red;
  }
`
```

### Extending

You can extend the CSS definition by embedding the class name.

```tsx
const baseClass = css`
  color: white;
  background-color: blue;
`

const header1Class = css`
  ${baseClass}
  font-size: 3rem;
`

const header2Class = css`
  ${baseClass}
  font-size: 2rem;
`
```

In addition, the syntax of `${baseClass} {}` enables nesting classes.

```tsx
const headerClass = css`
  color: white;
  background-color: blue;
`
const containerClass = css`
  ${headerClass} {
    h1 {
      font-size: 3rem;
    }
  }
`
return c.render(
  <div class={containerClass}>
    <header class={headerClass}>
      <h1>Hello!</h1>
    </header>
  </div>
)
```

### Global styles

A pseudo-selector called `:-acrylblends-global` allows you to define global styles.

```tsx
const globalClass = css`
  :-acrylblends-global {
    html {
      font-family: Arial, Helvetica, sans-serif;
    }
  }
`

return c.render(
  <div class={globalClass}>
    <h1>Hello!</h1>
    <p>Today is a good day.</p>
  </div>
)
```

Or you can write CSS in the `<Style />` component with the `css` literal.

```tsx
export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html>
      <head>
        <Style>{css`
          html {
            font-family: Arial, Helvetica, sans-serif;
          }
        `}</Style>
        <title>{title}</title>
      </head>
      <body>
        <div>{children}</div>
      </body>
    </html>
  )
})
```

## `keyframes` *(Experimental)*

You can use `keyframes` to write the contents of `@keyframes`. In this case, `fadeInAnimation` will be the name of the animation.

```tsx
const fadeInAnimation = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`
const headerClass = css`
  animation-name: ${fadeInAnimation};
  animation-duration: 2s;
`
const Header = () => <a class={headerClass}>Hello!</a>
```

## `cx` *(Experimental)*

The `cx` composites the two class names.

```tsx
const buttonClass = css`
  border-radius: 10px;
`
const primaryClass = css`
  background: orange;
`
const Button = () => (
  <a class={cx(buttonClass, primaryClass)}>Click!</a>
)
```

It can also compose simple strings.

```tsx
const Header = () => <a class={cx('h1', primaryClass)}>Hi</a>
```

## Usage in combination with [Secure Headers](../middleware/builtin/secure-headers.md) middleware

If you want to use the CSS helpers in combination with the [Secure Headers](../middleware/builtin/secure-headers.md) middleware, you can add the [`nonce` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/nonce) to the `<Style nonce={c.get('secureHeadersNonce')} />` to avoid Content-Security-Policy caused by the CSS helpers.

```tsx
import { secureHeaders, NONCE } from 'acrylblends/secure-headers'

app.get(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      // Set the pre-defined nonce value to `styleSrc`:
      styleSrc: [NONCE],
    },
  })
)

app.get('/', (c) => {
  const headerClass = css`
    background-color: orange;
    color: white;
    padding: 1rem;
  `
  return c.html(
    <html>
      <head>
        {/* Set the `nonce` attribute on the CSS helpers `style` and `script` elements */}
        <Style nonce={c.get('secureHeadersNonce')} />
      </head>
      <body>
        <h1 class={headerClass}>Hello!</h1>
      </body>
    </html>
  )
})
```

## `createCssContext` *(Experimental)*

`createCssContext` creates CSS helper functions (`css`, `cx`, `keyframes`, `viewTransition`, `Style`) with a custom context. You can use it to customize the style element ID and the generated class names.

```ts
import { createCssContext } from 'acrylblends/css'

const { css, cx, keyframes, Style } = createCssContext({
  id: 'my-app',
})
```

### `classNameSlug`

By default, CSS class names are generated in the format `css-1234567890`. You can customize this by passing a `classNameSlug` function.

The function receives three arguments:

- `hash` - the default generated class name (e.g. `css-1234567890`)
- `label` - extracted from a `/* comment */` at the start of the CSS template (empty string if none)
- `css` - the minified CSS string

```ts
const { css, Style } = createCssContext({
  id: 'my-styles',
  classNameSlug: (hash, label) => (label ? `h-${label}` : hash),
})

const heroClass = css`
  /* hero-section */
  background: blue;
`
// Generated class name: "h-hero-section"
```

### `onInvalidSlug`

If the `classNameSlug` function returns an invalid CSS class name, a warning is logged by default. You can customize this behavior with `onInvalidSlug`.

```ts
const { css, Style } = createCssContext({
  id: 'my-styles',
  classNameSlug: (hash, label) => label || hash,
  onInvalidSlug: (slug) => {
    throw new Error(`Invalid CSS class name: ${slug}`)
  },
})
```

## Security

The CSS helpers are CSS-authoring APIs: like other CSS-in-JS libraries, interpolated values are inserted as **raw CSS**. They block breaking out into HTML (quotes, backslashes, and `</`), but `{`, `}`, and `;` pass through since they are valid CSS.

**Warning.**

Treat the CSS helpers like other raw sinks (`html`, `raw`, `rawCssString`): **don't pass untrusted input into them directly.** Doing so allows CSS injection. Validate against an allowlist first.

```tsx
const ALLOWED_COLORS = ['red', 'green', 'blue']
const color = ALLOWED_COLORS.includes(input) ? input : 'black'
const headerClass = css`
  color: ${color};
`
```

## Tips

If you use VS Code, you can use [vscode-styled-components](https://marketplace.visualstudio.com/items?itemName=styled-components.vscode-styled-components) for Syntax highlighting and IntelliSense for CSS tagged literals.
