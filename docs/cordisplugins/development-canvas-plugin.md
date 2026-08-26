# Development Canvas as a standalone Cordis plugin

Development Canvas follows the same law as the rest of ACRYL: **everything is a
plugin**. It is not a Desktop subpath, a Desktop child plugin, or unconditional
logic inside the Electron bootstrap.

## Package and composition

Canvas owns the independent `dsh-plugin-development-canvas` Yarn workspace and
package. Its bundle patch contributes one stable Loader row:

```yaml
- id: desktop-development-canvas
  name: dsh-plugin-development-canvas
```

The package root is the Host plugin. The package also declares `dsh.client` and
exports `./client`, so the DSH Client module graph derives the browser plugin
from the same enabled Loader entry.

A profile patch can disable the whole capability without editing either
package:

```yaml
- id: desktop-development-canvas
  disabled: true
```

## Host Fiber

`dsh-plugin-development-canvas/src/index.ts` hard-injects `webServer`. One
`ctx.effect()` owns the private PTY registry and all same-origin routes.

Activation is transactional. If any route registration fails, every earlier
registration is removed before the error escapes. Normal disposal removes
routes first and then awaits all PTY processes and subscriptions reaching
quiescence.

The PTY registry stays an internal module rather than becoming a Service. No
neighboring plugin consumes it, so exposing it would create a shallow,
hypothetical seam.

## Client Fiber and Desktop seam

Desktop owns only the advanced frame. That frame declares the single/root
`desktop.main` slot and contributes the upstream conversation at priority 100.

The independent Canvas Client plugin uses:

```ts
export const inject = ['slots']

ctx.slots.inject('desktop.main', () => {
  // register Canvas at priority 0
  // return cleanup for the slot, styles, and PTY client owner
})
```

Canvas therefore wins while its Client Fiber and the slot declaration are both
live. Removing Canvas unregisters its priority-0 entry, and the Desktop
conversation fallback becomes visible automatically. There is no status route,
polling timer, global presence store, or React import from Desktop to Canvas.

The declaration effect owns a `CanvasPtyClient`. It tracks every Host session
opened by that Client activation. Disposal closes all tracked sessions and also
closes a late session whose asynchronous start settles during teardown.

## Current functional scope

One active tab fills the main content area. `+` opens terminal/agent, file, or
browser tabs. Terminal and agent tabs use `node-pty` with xterm.js rendering,
byte input, ANSI/alternate-screen support, and resize propagation.

The hardcoded coding-agent command list remains transitional transport R&D. It
must not become room identity, relay, resume, or orchestration. Those concerns
will use the later `acrAgentControl` capability.

File tabs remain an in-memory editor. Browser tabs remain sandboxed HTTP(S)
iframes. Neither limitation belongs in the Desktop shell.

## Lifecycle verification

The standalone package tests cover:

- Host plugin name and `inject` contract;
- rollback after partial route activation;
- route and process cleanup;
- real TTY allocation, byte input, and resize;
- Client-owned session cleanup, including late start settlement;
- Canvas priority replacing and then restoring the conversation fallback;
- tab state behavior.

Run:

```sh
corepack yarn workspace dsh-plugin-development-canvas check
corepack yarn workspace dsh-plugin-desktop verify:loader
corepack yarn workspace dsh-plugin-desktop verify:profile
```
