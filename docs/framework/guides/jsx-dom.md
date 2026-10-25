# Client Components

`acrylblends/jsx` supports not only server side but also client side. This means that it is possible to create an interactive UI that runs in the browser. We call it Client Components or `acrylblends/jsx/dom`.

It is fast and very small. The counter program in `acrylblends/jsx/dom` is only 2.8KB with Brotli compression, but 47.8KB for React.

This section introduces Client Components-specific features.

## Counter example

Here is an example of a simple counter, the same code works as in React.

```tsx
import { useState } from 'acrylblends/jsx'
import { render } from 'acrylblends/jsx/dom'

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}

function App() {
  return (
    <html>
      <body>
        <Counter />
      </body>
    </html>
  )
}

const root = document.getElementById('root')
render(<App />, root)
```

## `render()`

You can use `render()` to insert JSX components within a specified HTML element.

```tsx
render(<Component />, container)
```

You can see full example code here: Counter example.

## Hooks compatible with React

acrylblends/jsx/dom has Hooks that are compatible or partially compatible with React. You can learn about these APIs by looking at [the React documentation](https://react.dev/reference/react/hooks).

- `useState()`
- `useEffect()`
- `useRef()`
- `useCallback()`
- `use()`
- `startTransition()`
- `useTransition()`
- `useDeferredValue()`
- `useMemo()`
- `useLayoutEffect()`
- `useReducer()`
- `useDebugValue()`
- `createElement()`
- `memo()`
- `isValidElement()`
- `useId()`
- `createRef()`
- `forwardRef()`
- `useImperativeHandle()`
- `useSyncExternalStore()`
- `useInsertionEffect()`
- `useFormStatus()`
- `useActionState()`
- `useOptimistic()`

## `startViewTransition()` family

The `startViewTransition()` family contains original hooks and functions to handle [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API) easily. The examples below demonstrate how to use them.

### 1. A very simple example

You can write a transition using the `document.startViewTransition` shortly with the `startViewTransition()`.

```tsx
import { useState, startViewTransition } from 'acrylblends/jsx'
import { css, Style } from 'acrylblends/css'

export default function App() {
  const [showLargeImage, setShowLargeImage] = useState(false)
  return (
    <>
      <Style />
      <button
        onClick={() =>
          startViewTransition(() =>
            setShowLargeImage((state) => !state)
          )
        }
      >
        Click!
      </button>
      <div>
        {!showLargeImage ? (
          <img src="/photo.jpg" alt="" />
        ) : (
          <div
            class={css`
              background: url('/photo.jpg');
              background-size: contain;
              background-repeat: no-repeat;
              background-position: center;
              width: 600px;
              height: 600px;
            `}
          ></div>
        )}
      </div>
    </>
  )
}
```

### 2. Using `viewTransition()` with `keyframes()`

The `viewTransition()` function allows you to get the unique `view-transition-name`.

You can use it with the `keyframes()`, The `::view-transition-old()` is converted to `::view-transition-old(${uniqueName))`.

```tsx
import { useState, startViewTransition } from 'acrylblends/jsx'
import { viewTransition } from 'acrylblends/jsx/dom/css'
import { css, keyframes, Style } from 'acrylblends/css'

const rotate = keyframes`
  from {
    rotate: 0deg;
  }
  to {
    rotate: 360deg;
  }
`

export default function App() {
  const [showLargeImage, setShowLargeImage] = useState(false)
  const [transitionNameClass] = useState(() =>
    viewTransition(css`
      ::view-transition-old() {
        animation-name: ${rotate};
      }
      ::view-transition-new() {
        animation-name: ${rotate};
      }
    `)
  )
  return (
    <>
      <Style />
      <button
        onClick={() =>
          startViewTransition(() =>
            setShowLargeImage((state) => !state)
          )
        }
      >
        Click!
      </button>
      <div>
        {!showLargeImage ? (
          <img src="/photo.jpg" alt="" />
        ) : (
          <div
            class={css`
              ${transitionNameClass}
              background: url('/photo.jpg');
              background-size: contain;
              background-repeat: no-repeat;
              background-position: center;
              width: 600px;
              height: 600px;
            `}
          ></div>
        )}
      </div>
    </>
  )
}
```

### 3. Using `useViewTransition`

If you want to change the style only during the animation. You can use `useViewTransition()`. This hook returns the `[boolean, (callback: () => void) => void]`, and they are the `isUpdating` flag and the `startViewTransition()` function.

When this hook is used, the Component is evaluated at the following two times.

- Inside the callback of a call to `startViewTransition()`.
- When [the `finish` promise becomes fulfilled](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition/finished)

```tsx
import { useState, useViewTransition } from 'acrylblends/jsx'
import { viewTransition } from 'acrylblends/jsx/dom/css'
import { css, keyframes, Style } from 'acrylblends/css'

const rotate = keyframes`
  from {
    rotate: 0deg;
  }
  to {
    rotate: 360deg;
  }
`

export default function App() {
  const [isUpdating, startViewTransition] = useViewTransition()
  const [showLargeImage, setShowLargeImage] = useState(false)
  const [transitionNameClass] = useState(() =>
    viewTransition(css`
      ::view-transition-old() {
        animation-name: ${rotate};
      }
      ::view-transition-new() {
        animation-name: ${rotate};
      }
    `)
  )
  return (
    <>
      <Style />
      <button
        onClick={() =>
          startViewTransition(() =>
            setShowLargeImage((state) => !state)
          )
        }
      >
        Click!
      </button>
      <div>
        {!showLargeImage ? (
          <img src="/photo.jpg" alt="" />
        ) : (
          <div
            class={css`
              ${transitionNameClass}
              background: url('/photo.jpg');
              background-size: contain;
              background-repeat: no-repeat;
              background-position: center;
              width: 600px;
              height: 600px;
              position: relative;
              ${isUpdating &&
              css`
                &:before {
                  content: 'Loading...';
                  position: absolute;
                  top: 50%;
                  left: 50%;
                }
              `}
            `}
          ></div>
        )}
      </div>
    </>
  )
}
```

## The `acrylblends/jsx/dom` runtime

On Node you can skip the bundler: [Client components without a bundler](client-modules.md) serves `.tsx` client modules to the browser with
this runtime and one script tag, in development and in production.

There is a small JSX Runtime for Client Components. Using this will result in smaller bundled results than using `acrylblends/jsx`. Specify `acrylblends/jsx/dom` in `tsconfig.json`. For Deno, modify the deno.json.

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "acrylblends/jsx/dom"
  }
}
```

Alternatively, you can specify `acrylblends/jsx/dom` in the esbuild transform options in `vite.config.ts`.

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    jsxImportSource: 'acrylblends/jsx/dom',
  },
})
```
