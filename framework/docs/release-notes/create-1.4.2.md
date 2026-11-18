# create-acrylblends 1.4.2

Ships with [acrylblends 1.4.0](acrylblends-1.4.0.md), and needs at least that release.

## Fixed

- **A new app has `plugin pull --from`, the showcase and, from the agent template, a home page that shows plugins' widgets.** 1.4.1 was content with acrylblends 1.3.1, so `npm create acrylblends@latest` on a machine that had run it before reused npm's cached copy with an older acrylblends: `--from` was unknown, `npx acrylblends add showcase` found no showcase, and a new agent app had no `home` plugin for widgets. 1.4.2 asks for acrylblends 1.4.0 or later, so npm fetches it again.
