#  DSH UI / Styling System, Libs, Styling-UI-tech-Stack


It has been inspected the current `master` source of DSH rather than relying on the documentation alone
 The important correction is that DSH's styling system is **not just “CSS Modules + clsx”**. It is a fairly deliberate end-to-end pipeline:



```text
React 18 components
        │
        ├── .tsx
        │     └── clsx(...)
        │
        └── .module.css
              │
              ▼
      custom DSH tsdown/Rolldown pipeline
              │
              └── Lightning CSS
                    ├── CSS Modules
                    ├── class-name hashing
                    ├── minification
                    └── CSS transform
              │
              ▼
      plugin-owned <style> element
              │
              ├── data-plugin="<package>"
              └── data-plugin-css="<package>/<file>"
              │
              ▼
          browser DOM
```

At the same time, a separate `ui-theme` plugin owns the **global design-token sheets**, and `ui-layout` projects the active theme state onto the DOM. The result is a combination of **source-local CSS + centralized semantic tokens + plugin-owned style lifecycle**. ([GitHub][1])

---

# 1. Exact technology stack

## Runtime / frontend

DSH's client is fundamentally:

* **React 18.2**
* **TypeScript 6**
* native browser DOM/CSS APIs
* `clsx` for class composition
* **CSS Modules**
* CSS custom properties for design tokens
* **Shiki 4** for code highlighting
* a collection of Markdown/micromark libraries for rendering
* no Tailwind
* no MUI
* no Chakra
* no Radix-based component framework
* no external visual design-system dependency

The `ui-primitives` package explicitly describes itself as:

> “Pure React atoms for the dsh web UI … zero cordis”

and its package manifest includes React and `clsx`; it does not depend on a UI component framework. ([GitHub][2])

Exact source:

[ui-primitives/package.json](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/package.json?utm_source=chatgpt.com)

---

# 2. The surprising part: CSS Modules are compiled by DSH itself

This is the part I would consider especially relevant to ACRYL.

The core CSS pipeline lives here:

```text
packages/client/tsdown.client.ts
```

The file imports:

```ts
import { Rolldown } from 'tsdown'
import { transform } from 'lightningcss'
```

and defines custom virtual CSS loaders.

So the styling pipeline is **not “let Vite deal with CSS.”**

DSH intercepts CSS imports in its own client-bundle compiler.

Exact source:

[packages/client/tsdown.client.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/tsdown.client.ts?utm_source=chatgpt.com)

The architecture documentation also explicitly describes the client bundle as a closure-factory artifact and states that CSS is compiled by Lightning CSS inside the bundle. ([GitHub][3])

---

# 3. `.module.css` handling — exact mechanism

Suppose the source says:

```tsx
import css from './Button.module.css'
```

DSH's custom `dsh-css-modules-inline` plugin detects:

```text
*.module.css
```

Then:

1. Resolves the physical stylesheet.
2. Converts it into a virtual module ID.
3. Reads the CSS source.
4. Passes it to **Lightning CSS**.
5. Enables CSS Modules.
6. Uses:

```ts
cssModules: {
  pattern: '[hash]_[local]',
}
```

7. Enables:

```ts
minify: true
```

8. Receives the transformed CSS plus CSS Modules exports.
9. Generates a JavaScript module containing:

   * the compiled CSS
   * the class-name map

So the transformation is conceptually:

```text
Button.module.css

.button { ... }
.primary { ... }
```

→ Lightning CSS →

```text
.a8f3c_button { ... }
.a8f3c_primary { ... }
```

and the JavaScript side receives something conceptually equivalent to:

```ts
{
  button: 'a8f3c_button',
  primary: 'a8f3c_primary'
}
```

That class map is then the thing imported as `css`.

This is implemented directly in:

```text
packages/client/tsdown.client.ts
```

around the `dsh-css-modules-inline` plugin.

The source uses `cssModules.pattern: '[hash]_[local]'` and constructs the export map from Lightning CSS's returned `cssExports`. This is one of the most important implementation details in the entire styling system.

---

# 4. DSH does NOT use a conventional CSS-loader runtime

A normal frontend stack might look like:

```text
Webpack/Vite
   ↓
css-loader
   ↓
style-loader
   ↓
CSS Modules runtime
```

DSH does something much more tightly integrated with its plugin runtime:

```text
TSX import
   ↓
DSH custom tsdown plugin
   ↓
Lightning CSS
   ↓
generated JS
   ↓
styleInjectionModule(...)
   ↓
<style data-plugin="...">
```

The helper is literally inside:

```text
packages/client/tsdown.client.ts
```

and constructs a style injection module.

Its logic is approximately:

```ts
const css = "...compiled CSS..."
const tagId = "<plugin>/<stylesheet>"

if (
  document.querySelector(
    `style[data-plugin-css="${tagId}"]`
  ) === null
) {
  const tag = document.createElement('style')

  tag.dataset.plugin = pluginId
  tag.dataset.pluginCss = tagId

  tag.textContent = css
  document.head.appendChild(tag)
}
```

This means **the CSS is a side effect of materializing the plugin's JavaScript module**.

That is a major architectural difference from a conventional frontend.

---

# 5. Three different kinds of CSS imports

DSH's compiler distinguishes three cases.

## A. `*.module.css`

Example:

```tsx
import css from './Button.module.css'
```

Purpose:

* local component styling
* CSS Modules
* hashed classes
* compiled/minified by Lightning CSS
* exports class map to JavaScript
* automatically injected as a plugin-owned `<style>`

This is the standard path for components.

---

## B. `*.css?inline`

Example:

```ts
import themeCss from './design-platform.css?inline'
```

Purpose:

* obtain compiled CSS **as a string**
* do not generate a class map
* allow the owning plugin to decide when/how it gets mounted

This is used by `ui-theme`.

Exact file:

```text
packages/client/ui-theme/src/client/styles.ts
```

It imports:

```ts
import base from '../styles/base.css?inline'
import cornerShape from '../styles/corner-shape.css?inline'
import designPlatform from '../styles/design-platform.css?inline'
import scrollbar from '../styles/scrollbar.css?inline'
import gradientShadowText from '../styles/gradient-shadow-text.css?inline'
import shiki from '../styles/shiki.css?inline'
```

Then it creates the `<style>` tags itself through a Cordis effect.

[ui-theme/styles.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/client/styles.ts?utm_source=chatgpt.com)

---

## C. ordinary `.css`

Global CSS without `.module.css` is also handled by DSH's custom build pipeline.

It gets:

```text
Lightning CSS
    ↓
minified CSS
    ↓
styleInjectionModule()
```

rather than going through CSS Modules.

So DSH has effectively created its own CSS import semantics:

```text
.module.css       → local class map + injected CSS
.css?inline       → compiled CSS string
.css              → global compiled CSS + injected style
```

That is a useful pattern for an agent framework because the semantics are deterministic.

---

# 6. `ui-theme` is the actual design-system authority

The components themselves are **not supposed to own the color system**.

The central authority is:

```text
packages/client/ui-theme/
```

The design system is split primarily into:

```text
packages/client/ui-theme/src/styles/base.css
packages/client/ui-theme/src/styles/design-platform.css
packages/client/ui-theme/src/styles/scrollbar.css
packages/client/ui-theme/src/styles/corner-shape.css
packages/client/ui-theme/src/styles/gradient-shadow-text.css
packages/client/ui-theme/src/styles/shiki.css
```

The official styling guide explicitly describes `ui-theme` as owning the `--dsw-*` token system and the global theme sheets. ([GitHub][1])

---

# 7. DSH has two levels of tokens

This is important.

It is not simply:

```css
--primary: blue;
```

There is a layered token architecture.

## Level 1 — static tokens

Examples from:

```text
design-platform.css
```

include:

```css
--dsw-static-blue-500
--dsw-static-neutral-900
--dsw-static-deepseek-500
--dsw-static-red-500
--dsw-static-green-500
```

These are essentially the palette primitives.

---

## Level 2 — semantic aliases

Then DSH maps them into semantic roles:

```css
--dsw-alias-bg-base
--dsw-alias-bg-layer-1
--dsw-alias-bg-overlay

--dsw-alias-label-primary
--dsw-alias-label-secondary

--dsw-alias-border-l1
--dsw-alias-border-l2
--dsw-alias-border-l3

--dsw-alias-button-primary-fill
--dsw-alias-button-primary-hover

--dsw-alias-interactive-bg-hover
--dsw-alias-interactive-bg-active

--dsw-alias-state-error-primary
--dsw-alias-state-success-primary
--dsw-alias-state-warn-primary
```

So a component should generally say:

```css
color: var(--dsw-alias-label-primary);
```

rather than:

```css
color: rgb(30, 30, 30);
```

The design-platform file provides the semantic mapping.

Exact source:

[design-platform.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/design-platform.css?utm_source=chatgpt.com)

The styling rules explicitly require feature code to consume semantic aliases rather than independently reaching into the static palette. ([GitHub][1])

---

# 8. Light/dark is entirely outside the component

This is one of DSH's strongest architectural choices.

The component does **not** do this:

```tsx
const dark = ...
return <div className={dark ? css.dark : css.light}>
```

and its CSS does not normally do this:

```css
.component {
  ...
}

body[data-dark] .component {
  ...
}
```

Instead:

```text
component CSS
    ↓
semantic variable
    ↓
design-platform.css
    ↓
light/dark token table
```

For example:

```css
.primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
```

Then the theme sheet changes what those variables mean.

The styling guide explicitly prohibits theme selectors in feature component CSS and puts light/dark responsibility in the theme owner. ([GitHub][1])

---

# 9. Exact dark-theme mechanism

`design-platform.css` has:

```css
body {
  --dsw-alias-bg-base: ...;
  --dsw-alias-label-primary: ...;
  ...
}
```

and then:

```css
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: ...;
  --dsw-alias-label-primary: ...;
  ...
}
```

So there isn't a dark-mode class on every component.

The entire application gets a different token environment through one DOM attribute.

Conceptually:

```text
                 light
                  │
body ─────────────┤
                  │
           --dsw-alias-*
                  │
                  ▼
             all components


                 dark
                  │
body[data-ds-dark-theme]
                  │
           --dsw-alias-*
                  │
                  ▼
             all components
```

This is much closer to a **dependency-injected visual environment** than traditional component-level theming.

---

# 10. `ThemeRuntime` makes the token system dynamic

There is also a real runtime theme service:

```text
packages/client/ui-theme/src/client/index.ts
```

Exact source:

[ui-theme client index](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/client/index.ts?utm_source=chatgpt.com)

The key types are:

```ts
export type ThemeTokens =
  Record<string, string>
```

and:

```ts
export interface ThemeTokenModes {
  light: string
  dark: string
}
```

and:

```ts
export interface ThemeDefinition {
  id: string
  colorScheme: 'light' | 'dark'
  tokens: ThemeTokens
}
```

The runtime exposes:

```ts
ctx.theme
```

and supports:

```ts
theme.setTheme(...)
theme.setFontSize(...)
theme.register(...)
theme.overrideTokens(...)
```

---

# 11. `overrideTokens()` is particularly interesting

This is a very Cordis-like piece.

A plugin can effectively say:

```ts
ctx.theme.overrideTokens(
  source,
  {
    '--dsw-alias-brand-primary': {
      light: '...',
      dark: '...',
    }
  }
)
```

The runtime stores override layers:

```text
base theme
    ↓
override A
    ↓
override B
    ↓
override C
```

Later overrides win.

And removing one layer restores whatever existed underneath it.

The implementation is explicitly designed as a **stack of token layers**.

The code calls this the token-level analogue of slot shading. ([GitHub][4])

This is much more interesting for ACRYL than a simple global CSS theme.

It means:

```text
theme = composable runtime state
```

rather than merely:

```text
theme = static CSS file
```

---

# 12. Every override must define light AND dark

DSH deliberately rejects:

```ts
{
  '--foo': '#123456'
}
```

for dynamic theme overrides.

It requires:

```ts
{
  '--foo': {
    light: '#123456',
    dark: '#abcdef'
  }
}
```

The runtime even performs a runtime shape check because model-authored / dynamic callers can arrive as untyped JavaScript.

If the caller supplies a bare string, it throws an explanatory `TypeError`.

That is a very agent-oriented design decision: **the runtime validates the contract instead of trusting the caller**.

---

# 13. `ui-layout` is the presentation layer

An important separation exists:

```text
ui-theme
    = state / registry / theme semantics

ui-layout
    = DOM presentation of the theme
```

The presenter is:

```text
packages/client/ui-layout/src/client/theme-presenter.ts
```

Exact source:

[theme-presenter.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/src/client/theme-presenter.ts?utm_source=chatgpt.com)

It takes the immutable `ThemeSnapshot` and writes:

```ts
document.documentElement.style.colorScheme = scheme
```

Then:

```ts
document.documentElement.setAttribute(
  'data-ds-theme-source',
  ...
)
```

and:

```ts
body.setAttribute('data-ds-dark-theme', '')
```

for dark mode.

It also applies active token overrides directly to the body:

```ts
body.style.setProperty(name, value)
```

and sets:

```text
--dsh-content-font-size
```

---

# 14. React is deliberately NOT involved in theme projection

This is worth emphasizing.

The theme presenter is described in source as:

> pure DOM writes, no React involvement

So:

```text
theme change
    ↓
ctx.emit('theme/change')
    ↓
ThemePresenter.apply(...)
    ↓
DOM
```

not:

```text
theme change
    ↓
React state
    ↓
React render
    ↓
components
    ↓
DOM
```

That avoids forcing an entire React tree through a theme-render cycle.

Exact implementation:

```text
packages/client/ui-layout/src/client/theme-presenter.ts
packages/client/ui-layout/src/client/index.ts
```

The latter registers the presenter effect and subscribes to `theme/change`.

This separation is exactly the kind of thing a coding agent should understand before modifying the system. ([GitHub][1])

---

# 15. `ui-theme` injects global CSS as plugin-owned effects

The six global CSS files are loaded using `?inline`.

Then:

```text
packages/client/ui-theme/src/client/styles.ts
```

loops through:

```ts
const STYLES = [
  ['base.css', base],
  ['corner-shape.css', cornerShape],
  ['design-platform.css', designPlatform],
  ['scrollbar.css', scrollbar],
  ['gradient-shadow-text.css', gradientShadowText],
  ['shiki.css', shiki],
]
```

For each one it creates a Cordis effect:

```ts
ctx.effect(() => {
  const tag = document.createElement('style')

  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = `${PLUGIN_ID}/${name}`

  tag.textContent = css
  document.head.appendChild(tag)

  return () => {
    tag.remove()
  }
})
```

That means the lifetime is:

```text
ui-theme plugin starts
        ↓
global styles inserted

ui-theme plugin disposed
        ↓
global styles removed
```

This is not merely CSS inclusion.

It is **style ownership tied to plugin lifecycle**.

---

# 16. CSS itself has plugin identity

Every generated plugin stylesheet receives metadata like:

```html
<style
  data-plugin="@deepseek-ai/dsh-client-ui-theme"
  data-plugin-css="@deepseek-ai/dsh-client-ui-theme/design-platform.css"
>
```

This becomes important for hot reload and dynamic package replacement.

The runtime knows:

```text
which plugin injected this style
```

rather than treating all stylesheets as one undifferentiated global pool.

---

# 17. The client module system tracks stylesheet ownership

This part is in:

```text
packages/client/modules/src/client/system.ts
```

Exact source:

[client module system](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/client/system.ts?utm_source=chatgpt.com)

`claimStyles()` scans for style elements and associates unclaimed ones with the materializing plugin.

Then each module record contains:

```ts
styles: string[]
```

So a materialized plugin is conceptually:

```text
plugin
 ├── JS exports
 ├── dependency edges
 └── owned styles
```

When a bundle fails during materialization, DSH calls:

```ts
removeOwnedStyles(ownerId)
```

and when a plugin is invalidated for HMR, its owned styles are removed.

The actual style cleanup helper is:

```text
packages/client/modules/src/client/entry-lifecycle.ts
```

which does:

```ts
document.querySelectorAll('style[data-plugin]')
```

and removes matching plugin-owned tags.

Exact source:

[entry-lifecycle.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/client/entry-lifecycle.ts?utm_source=chatgpt.com)

---

# 18. This means CSS follows the plugin lifecycle

The complete lifecycle is:

```text
PACKAGE
  │
  ▼
tsdown build
  │
  ▼
CSS compiled
  │
  ▼
JS bundle contains CSS injector
  │
  ▼
bundle registers factory
  │
  ▼
plugin materialized
  │
  ▼
factory executes
  │
  ▼
<style data-plugin="...">
  │
  ▼
DOM
```

Then:

```text
HMR / plugin invalidation
       │
       ▼
remove plugin-owned styles
       │
       ▼
load fresh plugin code
       │
       ▼
inject fresh styles
```

This is why the source calls CSS injection a **module materialization side effect**.

The module contract explicitly documents this behavior. ([GitHub][5])

---

# 19. React components are extremely thin

Look at the actual Button.

```text
packages/client/ui-primitives/src/Button.tsx
```

Exact source:

[Button.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Button.tsx?utm_source=chatgpt.com)

It does essentially:

```tsx
import clsx from 'clsx'
import css from './Button.module.css'

...

className={clsx(
  css.button,
  css[variant],
  css[size],
  className
)}
```

That's it.

The actual visual definition is in:

```text
packages/client/ui-primitives/src/Button.module.css
```

[Button.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Button.module.css?utm_source=chatgpt.com)

For example:

```css
.primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}

.primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}
```

So the component has almost no styling logic.

The split is:

```text
Button.tsx
    = structure + behavior + state API

Button.module.css
    = geometry + presentation

ui-theme
    = visual semantics
```

That separation is intentional.

---

# 20. `clsx` is composition, not the styling system

DSH's use of `clsx` is very modest.

For Button:

```tsx
clsx(
  css.button,
  css[variant],
  css[size],
  className
)
```

So `clsx` solves:

```text
How do I compose these CSS Module classes?
```

It does **not** solve:

```text
How do I define spacing?
How do I define colors?
How do I theme?
How do I build the design system?
```

Those are solved elsewhere.

Therefore, describing DSH as:

> “a clsx-based styling system”

would be misleading.

The better description is:

> **CSS Modules + native CSS + semantic CSS variables + a custom Lightning CSS bundling pipeline, with clsx as the class composition helper.**

---

# 21. There is no Tailwind utility layer

A typical Tailwind component would look like:

```tsx
<button className="inline-flex h-9 rounded-lg px-4 text-sm ...">
```

DSH instead looks like:

```tsx
<button className={clsx(css.button, css.primary, css.md)}>
```

and:

```css
.button {
  display: inline-flex;
  height: 36px;
  ...
}

.primary {
  background: var(--dsw-alias-button-primary-fill);
}
```

This gives the coding agent an explicit named vocabulary:

```text
.button
.primary
.ghost
.outline
.md
.sm
```

instead of a free-form string of utilities.

The project documentation explicitly says:

> CSS Modules + clsx, no component library, no Tailwind. ([GitHub][1])

---

# 22. `:global()` exists, but it is controlled

DSH does use the CSS Modules escape hatch.

For example `AppFrame.module.css` contains:

```css
:global([data-platform='darwin']) .frame {
  ...
}
```

and:

```css
:global([data-windows-titlebar]) .frame {
  ...
}
```

Exact source:

[AppFrame.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/src/client/AppFrame.module.css?utm_source=chatgpt.com)

This is useful to understand because DSH's rule is not:

> global selectors are forbidden.

Rather:

> **global selectors are reserved for explicit shell/platform integration points.**

The ordinary component API remains locally scoped.

---

# 23. Inline styles are also used — but for the right reason

DSH does not ban React inline styles.

`AppFrame.tsx` has:

```tsx
style={{
  gridTemplateColumns:
    `${cols.sidebar}px minmax(0, 1fr) ${cols.rightbar}px`,
}}
```

and runtime positioning:

```tsx
style={{ left: props.left }}
```

These are values that genuinely come from runtime geometry.

The distinction is:

```text
GOOD

style={{ left: runtimePosition }}
style={{ gridTemplateColumns: runtimeLayout }}

BAD

style={{ color: isDark ? '#fff' : '#000' }}
style={{ background: theme === ... ? ... : ... }}
```

Theme semantics belong to the CSS token system.

This separation is explicitly codified in DSH's styling guidance. ([GitHub][1])

---

# 24. There are component-local custom properties too

DSH sometimes introduces a local `--dsh-*` variable for behavior that is not part of the global design language.

For example scrollbar styling uses:

```css
--dsh-scrollbar-thumb
--dsh-scrollbar-thumb-hover
--dsh-scrollbar-width
--dsh-scrollbar-track-margin
```

Then an elevated component can rebind those values locally.

This is an important distinction:

```text
--dsw-* 
    = design-system vocabulary

--dsh-*
    = implementation/component/runtime vocabulary
```

The scrollbar implementation is a particularly good example.

Exact source:

[scrollbar.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/scrollbar.css?utm_source=chatgpt.com)

---

# 25. Scrollbars show how sophisticated the CSS layer actually is

DSH isn't using tokens only for colors.

`scrollbar.css` has:

```css
--dsh-scrollbar-thumb
--dsh-scrollbar-thumb-hover
--dsh-scrollbar-thumb-border
--dsh-scrollbar-track-margin
--dsh-scrollbar-width
```

and handles two rendering strategies:

```text
Firefox / standard scrollbar properties
          OR
WebKit pseudo-elements
```

It conditionally uses:

```css
@supports not selector(::-webkit-scrollbar)
```

for one path and:

```css
::-webkit-scrollbar
::-webkit-scrollbar-thumb
::-webkit-scrollbar-thumb:hover
```

for the other.

This is not something a generic component library is giving DSH.

It's **project-owned CSS engineering**.

---

# 26. Corner geometry is centralized too

Another interesting example:

```text
packages/client/ui-theme/src/styles/corner-shape.css
```

DSH enables:

```css
corner-shape: superellipse(1.5)
```

behind:

```css
@supports (corner-shape: superellipse(1.5))
```

and defines:

```css
--dsw-corner-shape
```

globally.

Then components that need a genuinely circular/pill-like shape explicitly use:

```css
corner-shape: round;
```

Exact source:

[corner-shape.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/corner-shape.css?utm_source=chatgpt.com)

So again:

```text
global theme layer
    ↓
browser-level visual policy
    ↓
components inherit the environment
```

---

# 27. Typography is tokenized, too

`base.css` defines things such as:

```css
--dsw-font-family
--ds-font-family-code
--ds-ease-in-out
--ds-transition-duration
--ds-transition-duration-fast
--ds-transition-duration-slow
```

Exact source:

[base.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/base.css?utm_source=chatgpt.com)

The component CSS then references those or semantic aliases rather than inventing a completely separate motion/typography environment.

---

# 28. Shiki is integrated into the same theme system

DSH has:

```text
packages/client/ui-theme/src/styles/shiki.css
```

which defines:

```css
--shiki-foreground
--shiki-background
--shiki-token-constant
--shiki-token-string
--shiki-token-comment
...
```

and switches those values for dark mode.

The foreground/background variables are tied back into DSH's Markdown/code-block tokens.

So even the syntax-highlighting layer is brought under the same CSS-variable architecture rather than introducing an independent theme runtime.

Exact source:

[shiki.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/shiki.css?utm_source=chatgpt.com)

---

# 29. `ui-primitives` is the canonical shared component source

The barrel:

```text
packages/client/ui-primitives/src/index.ts
```

exports:

```text
Button
Checkbox
Input
Switch
Menu
Modal
Tooltip
Toast
HoverCard
Pill
Tag
StateDot
...
```

as well as larger content renderers:

```text
CodeBlock
JsonBlock
MarkdownText
TerminalBlock
DiffBlock
SearchBlock
WebBlock
JsonTree
```

Exact source:

[ui-primitives/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/index.ts?utm_source=chatgpt.com)

The styling guide treats this package as the canonical shared visual primitive channel across feature packages. ([GitHub][1])

---

# 30. Interesting build distinction: `ui-primitives` is static-linked

This is another detail that matters architecturally.

Its build config is:

```text
packages/client/ui-primitives/tsdown.config.ts
```

and uses:

```ts
staticLinked(
  '@deepseek-ai/dsh-client-ui-primitives',
  ['lib/types/index.js'],
)
```

rather than:

```ts
clientBundle(...)
```

Exact source:

[ui-primitives/tsdown.config.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/tsdown.config.ts?utm_source=chatgpt.com)

By contrast:

```text
packages/client/ui-theme/tsdown.config.ts
```

uses:

```ts
clientBundle(
  '@deepseek-ai/dsh-client-ui-theme',
  ['lib/types/index.js'],
)
```

Exact source:

[ui-theme/tsdown.config.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/tsdown.config.ts?utm_source=chatgpt.com)

That fits the role of `ui-primitives` as part of the baseline client platform.

---

# 31. React itself is a shared platform singleton

`packages/client/web/src/platform.ts` defines the browser platform module table:

```ts
[
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  ...
]
```

Exact source:

[web platform.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/web/src/platform.ts?utm_source=chatgpt.com)

This means the browser runtime is deliberately designed so plugins do **not** create their own independent React runtime.

The module loader has a shared platform/module table, and the package graph enforces which things can cross the plugin boundary. ([GitHub][3])

---

# 32. The plugin boundary is also a styling boundary

The build system has a **client bundle purity gate** in:

```text
packages/client/tsdown.client.ts
```

The code explicitly rejects undeclared cross-plugin value imports.

Conceptually:

```text
plugin A
   │
   ├── own source
   ├── own CSS
   └── approved platform/shared dependencies
```

rather than:

```text
plugin A
   ↓
arbitrary runtime import
   ↓
plugin B
```

This matters for CSS too.

Every plugin can own:

```text
its TS
its CSS
its style tags
its lifecycle
```

but shared visual vocabulary goes through:

```text
ui-theme
ui-primitives
```

That is the real reason DSH's CSS architecture feels “plugin-native.”

---

# 33. Vite is not the primary plugin CSS compiler

The root application:

```text
apps/web
```

does use:

```text
Vite 6
@vitejs/plugin-react
```

but `apps/web` is essentially the web application entry over:

```text
@deepseek-ai/dsh-client-web
```

Its build script is simply:

```text
vite build
```

The specialized plugin-client compilation happens through the DSH `tsdown` machinery.

So don't model DSH as:

```text
Vite
 └── CSS Modules
```

The more accurate model is:

```text
Vite
   = application shell

tsdown/Rolldown + custom plugins
   = DSH client/plugin compilation

Lightning CSS
   = actual CSS transform engine
```

Exact package:

[apps/web/package.json](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/web/package.json?utm_source=chatgpt.com)

---

# 34. The actual build chain

The root package shows:

```text
build:lib:client
    ↓
tsc -b tsconfig.client.json
    ↓
tsdown --env.DSH_BUILD_FACE client
```

and the root devDependencies include:

```text
lightningcss
tsdown
typescript
vite
vitest
```

The project uses pnpm 11.

Exact root package:

[root package.json](https://github.com/deepseek-ai/deepseek-harness/blob/master/package.json?utm_source=chatgpt.com)

---

# 35. CSS Modules TypeScript support is intentionally tiny

The package has:

```text
packages/client/ui-primitives/src/css-modules.d.ts
```

containing essentially:

```ts
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
```

That's all TypeScript needs for the generic CSS-module import contract.

There isn't a giant generated styling type system.

Exact source:

[css-modules.d.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/css-modules.d.ts?utm_source=chatgpt.com)

The client TypeScript configuration includes these declarations across client packages. ([GitHub][6])

---

# 36. Concrete component example: Input

`Input.tsx`:

```tsx
import clsx from 'clsx'
import css from './Input.module.css'

...

<span className={clsx(css.wrap, className)}>
  ...
  <input className={css.input} ... />
</span>
```

`Input.module.css`:

```css
.wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.wrap:focus-within {
  border-color: var(--dsw-alias-brand-primary);
}
```

Again:

```text
structure → TSX
state/behavior → TSX
visual state → CSS
theme → variables
class composition → clsx
scope → CSS Modules
```

Exact sources:

[Input.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Input.tsx?utm_source=chatgpt.com)

[Input.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Input.module.css?utm_source=chatgpt.com)

---

# 37. Concrete component example: Modal

`Modal.tsx` owns behavior:

```text
open
onClose
Escape handling
portal
ARIA
```

while `Modal.module.css` owns:

```text
overlay geometry
mask
blur
dialog sizing
spacing
header
footer
colors
elevation
```

For example:

```css
.mask {
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}

.dialog {
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
}
```

There is no theme logic inside `Modal.tsx`.

Exact sources:

[Modal.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Modal.tsx?utm_source=chatgpt.com)

[Modal.module.css](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Modal.module.css?utm_source=chatgpt.com)

---

# 38. What the DSH coding agent should assume

For an agent modifying or creating a client component, the correct mental model is:

```text
              ┌──────────────────────┐
              │     ui-theme         │
              │                      │
              │ design tokens        │
              │ light/dark           │
              │ global CSS           │
              │ motion               │
              │ typography           │
              └──────────┬───────────┘
                         │
                         │ CSS variables
                         ▼
              ┌──────────────────────┐
              │ component.module.css │
              │                      │
              │ local styles         │
              │ pseudo states        │
              │ layout               │
              └──────────┬───────────┘
                         │
                         │ CSS Modules
                         ▼
              ┌──────────────────────┐
              │       TSX            │
              │                      │
              │ behavior             │
              │ structure            │
              │ class composition    │
              └──────────────────────┘
```

And the compiler/runtime adds:

```text
Lightning CSS
   ↓
hashed CSS
   ↓
plugin-owned <style>
   ↓
HMR lifecycle
```

---

# 39. Agent rules I would extract from DSH source

## When creating a component

Use:

```text
Component.tsx
Component.module.css
```

co-located.

Example:

```text
Foo.tsx
Foo.module.css
```

Import:

```tsx
import clsx from 'clsx'
import css from './Foo.module.css'
```

Use:

```tsx
className={clsx(css.root, css.variant, className)}
```

not large Tailwind strings.

---

## For colors

Prefer:

```css
color: var(--dsw-alias-label-primary);
```

not:

```css
color: #222;
```

and especially not:

```css
color: var(--dsw-static-neutral-900);
```

inside a feature component unless there is a documented reason.

The semantic alias layer is the intended component-facing contract. ([GitHub][1])

---

## For light/dark

Do not create:

```css
.dark { ... }
.light { ... }
```

and do not put:

```css
body[data-ds-dark-theme] ...
```

inside ordinary feature components.

Instead:

```css
background: var(--dsw-alias-bg-layer-1);
```

and let `ui-theme` provide the values.

---

## For runtime dimensions

Inline styles are appropriate:

```tsx
style={{
  left: position,
  width: width,
  gridTemplateColumns: columns,
}}
```

when the value is actual runtime layout state.

Do not use inline styles as an alternate theme engine.

---

## For global CSS

Do not casually create another application-wide stylesheet.

Global visual policy belongs in:

```text
packages/client/ui-theme/src/styles/
```

and ordinary component styles belong beside components as `.module.css`.

---

## For a genuinely shared primitive

Put it into:

```text
packages/client/ui-primitives/
```

instead of creating three slightly different versions inside unrelated feature plugins.

The project explicitly treats `ui-primitives` as the shared visual component surface. ([GitHub][1])

---

# 40. The “library” is actually several cooperating systems

So I would describe DSH's styling stack like this:

### Styling language

```text
native CSS
```

### Scope mechanism

```text
CSS Modules
```

### Class composition

```text
clsx
```

### CSS compiler

```text
Lightning CSS
```

### Bundle/compiler integration

```text
tsdown + Rolldown
```

### Visual design system

```text
custom --dsw-* CSS custom-property system
```

### Theme runtime

```text
ThemeRuntime
```

### DOM projection

```text
ui-layout ThemePresenter
```

### Shared component source

```text
ui-primitives
```

### Style lifecycle

```text
Cordis effects + client module system
```

### Application shell

```text
Vite
```

That's the exact architectural stack much more accurately than simply saying “CSS Modules + clsx.”

---

# 41. And this is where your shadcn observation becomes interesting

DSH's architecture is actually **very compatible with a source-owned component registry**, but the registry would have to respect the above contracts.

A DSH-compatible source registry would ideally generate:

```text
Foo.tsx
Foo.module.css
Foo.test.tsx
```

and make the CSS look like:

```css
.foo {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
```

rather than generating:

```tsx
className="bg-background text-foreground ..."
```

So the interesting abstraction for ACRYL is not:

```text
shadcn + Tailwind
```

but:

```text
shadcn source-ownership model
        +
DSH token architecture
        +
DSH plugin lifecycle
        +
DSH CSS compiler
```

That would yield:

```text
registry
   │
   │ materialize source
   ▼
local .tsx
local .module.css
local tests
   │
   ▼
agent can inspect/edit/evolve
   │
   ▼
DSH-style compiler
   │
   ▼
plugin-owned runtime capability
```

That is substantially closer to an **agent-native “everything is a plugin” architecture** than a normal npm UI dependency.

---

# 42. Most important DSH source locations for a coding agent

### Styling rules / contract

[`docs/web-styling.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.md?utm_source=chatgpt.com)

### Client-specific agent rules

[`packages/client/AGENTS.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md?utm_source=chatgpt.com)

### CSS/compiler implementation

[`packages/client/tsdown.client.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/tsdown.client.ts?utm_source=chatgpt.com)

### Design tokens

[`packages/client/ui-theme/src/styles/design-platform.css`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/design-platform.css?utm_source=chatgpt.com)

### Base typography/motion

[`packages/client/ui-theme/src/styles/base.css`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/styles/base.css?utm_source=chatgpt.com)

### Theme runtime

[`packages/client/ui-theme/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/client/index.ts?utm_source=chatgpt.com)

### Global stylesheet mounting

[`packages/client/ui-theme/src/client/styles.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/src/client/styles.ts?utm_source=chatgpt.com)

### Theme → DOM projection

[`packages/client/ui-layout/src/client/theme-presenter.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/src/client/theme-presenter.ts?utm_source=chatgpt.com)

### Shared primitives

[`packages/client/ui-primitives/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/index.ts?utm_source=chatgpt.com)

### Real component example

[`Button.tsx`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Button.tsx?utm_source=chatgpt.com)

### Real component CSS

[`Button.module.css`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-primitives/src/Button.module.css?utm_source=chatgpt.com)

### Client module/style lifecycle

[`packages/client/modules/src/client/system.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/client/system.ts?utm_source=chatgpt.com)

### Style cleanup / HMR

[`packages/client/modules/src/client/entry-lifecycle.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/client/entry-lifecycle.ts?utm_source=chatgpt.com)

### Browser platform singleton table

[`packages/client/web/src/platform.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/web/src/platform.ts?utm_source=chatgpt.com)

### Web application shell

[`apps/web/package.json`](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/web/package.json?utm_source=chatgpt.com)

---

## One-line architectural summary

**DSH uses React + native CSS Modules + clsx, compiled by a custom tsdown/Rolldown pipeline with Lightning CSS, where components consume a centralized `--dsw-*` semantic-token environment and every plugin owns the runtime lifetime of the `<style>` tags it injects.** ([GitHub][1])

[1]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.md?utm_source=chatgpt.com "deepseek-harness/docs/web-styling.md at master · deepseek-ai/deepseek-harness · GitHub"
[2]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md?utm_source=chatgpt.com "deepseek-harness/packages/client/AGENTS.md at master · deepseek-ai/deepseek-harness · GitHub"
[3]: https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md?utm_source=chatgpt.com "deepseek-harness/.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md at master · deepseek-ai/deepseek-harness · GitHub"
[4]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/README.md?utm_source=chatgpt.com "deepseek-harness/packages/client/ui-theme/README.md at master · deepseek-ai/deepseek-harness · GitHub"
[5]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/client/manifest.ts "deepseek-harness/packages/client/modules/src/client/manifest.ts at master · deepseek-ai/deepseek-harness · GitHub"
[6]: https://github.com/deepseek-ai/deepseek-harness/blob/master/tsconfig.base.client.json?utm_source=chatgpt.com "deepseek-harness/tsconfig.base.client.json at master · deepseek-ai/deepseek-harness · GitHub"


a **shadcn-style “source ownership” model fits DSH’s philosophy much better than a conventional component-library dependency**.

What DSH is avoiding is not necessarily “reusable components.” It is avoiding an **external UI authority** that bypasses DSH’s own architectural contracts.

DSH’s current rule is explicit: component styles use CSS Modules + `clsx`, feature packages consume semantic `--dsw-alias-*` tokens, and `ui-primitives` is the only component channel intended to cross feature-package boundaries. ([GitHub][1])

The important architectural distinction is:

```text
Traditional UI library
──────────────────────
feature plugin
   ↓
import Button from "@mui/material"
   ↓
external framework owns behavior/style/contracts


shadcn-style source components
──────────────────────────────
generator / registry
   ↓ copy
your repository
   ↓
ui-primitives/Button.tsx
ui-primitives/Button.module.css
   ↓
your tokens + your architecture + your tests
```

Once copied, a shadcn-like component is **your code**. That aligns surprisingly well with DSH.

### Why DSH still explicitly says “do not add a component library”

There are several architectural reasons visible in the repository.

**1. DSH wants one canonical primitive implementation.**

Its styling guide says that when a feature needs a shared control, it should reuse the existing primitive, and deliberate variants should become props on that primitive rather than becoming another implementation. ([GitHub][1])

That gives this:

```text
ui-chat ───────┐
ui-settings ───┤
ui-jobs ───────┤
ui-plan ───────┼──► ui-primitives/Button
ui-sidebar ────┤
plugin X ──────┤
plugin Y ──────┘
```

A naïve shadcn workflow tends toward:

```text
plugin A/components/Button.tsx
plugin B/components/Button.tsx
plugin C/components/Button.tsx
```

That would violate DSH’s desire for a single shared primitive surface.

But this is **not intrinsic to shadcn's model**. You could install generated components into `ui-primitives` rather than into every feature plugin.

---

**2. DSH's real design system is its token contract.**

The strongest abstraction isn't Button/Card/Dialog. It is the `--dsw-*` semantic token system.

`ui-theme` owns colors, typography, motion, gradients, shadows, scrollbar behavior, etc.; feature packages are supposed to consume those semantic aliases rather than invent styling independently. ([GitHub][1])

So the architecture is closer to:

```text
                   ┌──────────────────┐
                   │     ui-theme     │
                   │                  │
                   │ --dsw-alias-*    │
                   │ typography       │
                   │ elevation        │
                   │ motion           │
                   │ dark/light       │
                   └────────┬─────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ ui-primitives │
                    └───────┬───────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
      plugin A           plugin B           plugin C
```

That's stronger than simply adopting shadcn's default CSS conventions.

---

**3. DSH actually makes UI extensibility itself a plugin contract.**

This is where your comparison becomes particularly relevant.

`ui-theme` is itself a plugin layer. Third-party themes register alias-token overrides through `ctx.theme`; feature plugins don't own theme state themselves. ([GitHub][2])

And DSH has many separate UI packages:

```text
client-ui-chat
client-ui-conversation
client-ui-sidebar
client-ui-jobs
client-ui-plan
client-ui-settings
client-ui-primitives
client-ui-theme
...
```

The module graph confirms that UI is intentionally decomposed this way. ([GitHub][3])

So the architecture is closer to **UI functionality as plugins**, rather than “one big frontend plus a UI framework.”

---

## Where I think a shadcn-like idea fits DSH extremely well

Not:

```bash
npx shadcn add button dialog dropdown
```

with Tailwind/shadcn assumptions intact.

Instead, imagine:

```bash
dsh ui add button
dsh ui add dialog
dsh ui add command-palette
dsh ui add tree
```

And a registry contains **DSH-native source templates**.

Example:

```text
registry/
├── button/
│   ├── Button.tsx
│   ├── Button.module.css
│   ├── Button.spec.tsx
│   └── manifest.yml
│
├── dialog/
├── dropdown/
├── tree/
└── data-table/
```

Running:

```bash
dsh ui add dialog
```

could materialize:

```text
packages/client/ui-primitives/src/dialog/
    Dialog.tsx
    Dialog.module.css
    Dialog.spec.tsx
```

using:

```css
.dialog {
    background: var(--dsw-alias-surface-raised);
    color: var(--dsw-alias-text-primary);
    box-shadow: var(--dsw-elevation-panel);
}
```

No Tailwind.

No runtime component dependency.

No foreign theme system.

No black box.

That is very compatible with:

> everything is a plugin

because you could take the concept one step beyond shadcn.

## A DSH-native version could make the *component recipe itself* a plugin

For example:

```text
@dsh/registry-dialog
@dsh/registry-table
@dsh/registry-kanban
@dsh/registry-command-palette
```

Each registry entry could describe:

```yaml
name: dialog

provides:
  - ui.primitive.dialog

requires:
  - ui.theme
  - ui.portal
  - ui.focus-management

files:
  - Dialog.tsx
  - Dialog.module.css
  - Dialog.spec.tsx

tokens:
  - --dsw-alias-surface-overlay
  - --dsw-alias-text-primary
  - --dsw-elevation-prominent
```

Then the installer doesn't merely “copy React code.”

It **composes a capability into the architecture**.

That is much closer to Cordis/DSH philosophy than shadcn itself.

---

# This is particularly relevant to ACRYL BLENDS

For your self-evolving framework, I would actually separate three concepts:

```text
1. UI PRIMITIVE
   Button / Input / Dialog / Tree

2. UI CAPABILITY
   Command Palette / File Explorer / Chat Composer / Kanban

3. UI PLUGIN
   Complete feature exposing Cordis services / slots / commands
```

Then make all three source-installable:

```text
acryl add primitive/button

acryl add capability/command-palette

acryl add plugin/agent-inspector
```

The important property is:

```text
Registry ≠ dependency
Registry = source knowledge
```

That is powerful for a self-evolving agent because the agent gets the implementation in its own source tree and can reason about it, modify it, test it and evolve it.

A binary/npm component dependency looks like:

```text
Agent
  ↓
API surface
  ↓
[opaque dependency]
```

Source-owned component:

```text
Agent
  ↓
Button.tsx
Button.module.css
Button.spec.ts
manifest.yml
  ↓
full editable implementation
```

For an agent that is supposed to **modify itself**, the latter is materially better.

### So I would refine the earlier answer

DSH's rule:

> “no component library”

should not be interpreted as:

> “source-component registries are architecturally wrong.”

It means the project currently wants **`ui-primitives` + DSH tokens to remain the authority**. ([GitHub][1])

A shadcn-like **source distribution mechanism**, modified to generate DSH-native CSS Modules and put shared components into `ui-primitives`, would actually preserve those invariants:

```text
                      REGISTRY
                         │
                      source
                         ▼
                 ┌───────────────┐
                 │ ui-primitives │
                 │               │
                 │ Button.tsx    │
                 │ Dialog.tsx    │
                 │ Tree.tsx      │
                 └───────┬───────┘
                         │
                       tokens
                         │
                         ▼
                    ui-theme

                         ▲
                         │ imports
           ┌─────────────┼─────────────┐
           │             │             │
       ui-chat       ui-files      plugin-X
```

That gives you the best properties of both:

**shadcn philosophy**
→ source ownership
→ agent can inspect/change everything
→ no runtime UI-library lock-in
→ selective installation

**DSH philosophy**
→ strict token authority
→ CSS Modules
→ feature isolation
→ canonical primitives
→ Cordis/plugin composition

For **ACRYL BLENDS**, I would seriously consider generalizing this into a **“source registry as composable knowledge”** architecture—not just for UI components, but for tools, plugins, services, prompts, capabilities, migrations, tests, and entire agent behaviors. That would be a stronger interpretation of “everything is a plugin” than npm-package plugins alone.

[1]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.md?utm_source=chatgpt.com "deepseek-harness/docs/web-styling.md at master · deepseek-ai/deepseek-harness · GitHub"
[2]: https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-theme/README.md?utm_source=chatgpt.com "deepseek-harness/packages/client/ui-theme/README.md at master · deepseek-ai/deepseek-harness · GitHub"
[3]: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/module-graph.md?utm_source=chatgpt.com "deepseek-harness/docs/module-graph.md at master · deepseek-ai/deepseek-harness · GitHub"
