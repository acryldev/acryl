# Quickstart: Development Canvas

## Prerequisites

- Node `^22.19.0` or `>=24`, Corepack Yarn 4.18.0
- `corepack yarn install --immutable` at repo root

## Headless proof

```sh
corepack yarn workspace dsh-plugin-desktop test tests/development-canvas-state.spec.ts tests/canvas-pty.spec.ts
```

Expect:

- Creating a canvas yields a Chat tile
- "+" kinds append Terminal/File/Browser
- Second Chat add is a no-op
- Close removes the tile
- Fake PTY spawn writes output; dispose kills the child (tested with a stub spawner)

## Graphical proof (explicit)

```sh
corepack yarn dev
```

Switch the window to **advanced** mode if needed (tray / Desktop settings). In the main column:

1. Confirm Chat is present and "+" is visible
2. Add Terminal -> Shell, type a command, read output
3. Add File, type text
4. Add Browser, open `https://example.com` or a local URL
5. Close tiles; Chat can remain

Compatibility mode must look like upstream Chat with no canvas chrome.
