# acrylblends 1.5.0

Every new app opens in the ACRYL frame: the chat with its agents, branches, versions and Settings, in the browser or in its own window. Released with
[create-acrylblends 1.5.0](create-1.5.0.md) and the frame packages `@acrylblends/blends-frame` 0.1.2, `@acrylblends/brand-client` 0.1.1 and
`@acrylblends/versions` 0.1.1.

## Try it

```sh
npx acrylblends@latest init my-app -y
cd my-app && npm install && npm run dev      # the app in the frame, in the browser
npm run desktop                               # the same in its own window
```

A blueprint from the registry (https://acrylblends.github.io/blends), in the frame too:

```sh
npm create acrylblends@latest my-crm -- --from acrylblends.small-crm --install
cd my-crm && npm run dev
```

## What changed

- **`init` makes the app in the frame by default.** Before, `init` without `--desktop` made the plain app, and the README's own command
  (`init my-app --agent -y`) gave a page with no chat and no agents. `--bare` now asks for the plain app; `--desktop` is still accepted.
- **A registry blueprint opens in the frame.** `npm create acrylblends --from <id>` puts it in the frame (`add desktop`, then `upgrade`); `--bare` keeps
  it plain. A starter from another source (`github:`, an npm package, a folder) gets the frame with `--desktop`.
- **`upgrade` frames an app built on its own.** An app whose scaffold is no template's (a blueprint) but that carries the frame row (`src/frame.ts`,
  `FRAME_MOUNT_PREFIX` in `src/routes.ts`, `composeInto` in `src/app.ts`) gets the frame around it; its own files are never written. Its library
  plugins come up to this release, so its data moves to `~/.acryl/apps/<id>/`.
- **The frame (0.1.2):** Settings > Plugins has a live plugin graph with zoom and full screen, a Registry tab, View source, and a Share chooser (this
  computer, GitHub private or public, the public registry) with a Connect GitHub button that signs in through the browser. The browser tab shows the
  app's name and the ACRYL Blends logo.
- **Fixes from the workshop walk (Rifat):** a restart after a refused plugin update runs the version that worked; the chat template names the missing
  `DEEPSEEK_API_KEY`; the agent panel says when the app stopped during a run.

## Known limits

- Chats are filed by the app's folder: after moving the folder they are not shown in the frame yet.
- A public share creates a public GitHub repository.
