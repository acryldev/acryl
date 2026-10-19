# Testing ACRYL: a quick start for developers

A full test run of ACRYL and ACRYL Blends, start to finish, in about two hours. Each guide is a short list of things to do, what you should see, and
what to report when you do not see it.

| Step | Guide | What you prove |
|---|---|---|
| 1 | [Set up](01-setup.md) | ACRYL builds and starts from a clean clone on your machine |
| 2 | [Blend apps](02-blend-apps.md) | You can create an app from scratch and from a starter, run it, operate it in plain language, change it, save and copy it |
| 3 | [The IDE builds its own plugins](03-ide-plugins.md) | ACRYL as a daily IDE, and the agent writing a plugin into the running app |
| 4 | [Share and pull plugins](04-share-and-pull.md) | A plugin goes from your app to GitHub or npm and into another app, checked |
| 5 | [Report what you found](05-report.md) | What to send back, and how |

## The ideas in one minute

- **Cordis** is the plugin kernel (from DeepSeek): every piece of an app is a plugin that can be added, replaced or removed while the app runs.
- **An ACRYL Blend app** is a list of plugins in one file, `blend.yaml`, plus the code of the plugins made for it. The agent inside the app operates it
  (it has the app's own tools) and can grow it (it writes new plugins into the app while it runs).
- **A starter** (Blueprint) is a Blend others start from: `acryl new my-app --from acryl.music`. The public ones are listed at
  [acrylblends.github.io](https://acrylblends.github.io) and mirrored at [acryl.dev/blends](https://acryl.dev/blends).
- **ACRYL itself** (the IDE) is a Blend too: the same core plus the IDE plugins.

## Checklist

Copy this into your report and tick what worked.

```
Setup
[ ] clone, install and build finish without errors (time: ___)
[ ] the check suite passes (corepack pnpm run check)
[ ] ACRYL Desktop starts in its isolated home (corepack pnpm run dev)

Blend apps
[ ] a Blank app is created and starts; its window shows the app's name
[ ] the agent inside builds a small app from one sentence, and it works
[ ] an app from each starter opens as its own window with the agent beside it:
    [ ] music   [ ] accounting   [ ] gtd   [ ] organizer
[ ] plain-language prompts change the app while you watch (one per starter)
[ ] the agent extends a starter with a new feature
[ ] /blend snapshot records the app; acryl new --from <that folder> makes a working copy
[ ] the app saves to its own git repository (acryl remote connect, acryl save)

The IDE
[ ] add a project, create a worktree, open Claude Code / Codex / a terminal in it
[ ] the agent builds a UI plugin (a button) that appears without a restart
[ ] the agent builds a tool plugin and uses it in the same turn

Share and pull
[ ] /plugin save keeps a version; /plugin version patch makes the next one
[ ] /plugin share releases it to a GitHub repository (private, then public)
[ ] /plugin pull installs it into a second app, checked by its sha512
[ ] (optional) /plugin share <name> npm publishes to npm, /plugin pull npm:<name> installs it
```

## Ground rules

- Work in the isolated homes these guides use. ACRYL keeps everything of an app in that app's own home, so a test never touches your real ACRYL data.
- Use your own model key (DeepSeek, or any provider ACRYL supports). It is entered in the app's "Add an API key" dialog and stays on your machine.
- Use a GitHub organization or account made for testing when you share plugins (guide 4): sharing creates repositories and releases.
- When something fails, keep going with the next step and write it down (guide 5). One clear report of a failure is worth more than a fix guessed in
  a hurry.
