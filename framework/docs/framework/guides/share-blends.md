# Share a Blend: publish it, list it in the store, make apps from it, update them

A Blend is a whole app: a folder with a `blend.yaml`, its plugins and its data. Sharing one puts that folder in a GitHub repository, and optionally lists it in
the Blends store at [acrylblends.github.io](https://acrylblends.github.io). Anyone can then make an app from it and, when you release a newer version, bring
it in while keeping their own changes. Sharing a single plugin is a different, smaller thing: see [Share a plugin](share-plugins.md).

Every command and every output below was run on 2026-11-21 with the published packages (`acryl` 0.3.0, `@acryldev/blends` 1.7.21), as two people, Ana and
Ben, each with a home folder of their own, against the GitHub organization `inboxxobni`. Outputs are pasted as they came, with npm's install notices left
out and the folder names shortened to `<folder>`. You need Node.js 22.19 or newer, npm, git and `gh` signed in (`gh auth login`) to share; making an app
from a public Blend needs no login.

## 1. Make an app

```sh
npx acryl@latest new sh-guide-notes
```

```
Next:
  cd sh-guide-notes
  npm run dev
```

The folder is a git repository with one commit. Put something in it (here a plugin `plugins/greeting/`, with a row for it in `blend.yaml`) and give the
app a description: a Blend is listed in the store with its description, so `blend.yaml` needs `metadata.description`. Without one, the plan says so:

```
{"ok":false,"reason":"the store lists an app with its description: add one to blend.yaml (metadata.description)"}
```

## 2. Share it to your own GitHub, and list it in the store

```sh
npm run share -- --owner inboxxobni --visibility public --list --category business
```

It shows what it would do and sends nothing until you type `yes`:

```
Share this app to a new public repository github.com/inboxxobni/sh-guide-notes: 2 changed files, saved first, and the versions saved so far. Listed in the Blends store as inboxxobni.sh-guide-notes, Community, under business (licence MIT, people start from v0.1.0).
Type yes to send it: yes
shared to https://github.com/inboxxobni/sh-guide-notes.git (created)
listed in the Blends store from v0.1.0: acrylblends.github.io shows it within about an hour
```

| Option | Does |
| --- | --- |
| `--owner <account>` | the GitHub account or organization for a new repository; yours when absent |
| `--visibility private\|public` | who can see a new repository; private when absent, and kept in `blend.yaml` |
| `--list` | also list it in the Blends store as Community under your name; public only |
| `--category <address>`, `--subcategory <address>` | where the store puts it, one of the categories on [acrylblends.github.io/blends](https://acrylblends.github.io/blends) |
| `--license <id>` | an SPDX id; MIT when absent |
| `--json` | print the plan as JSON and send nothing |

`npm run share -- --json` printed this plan before the real run:

```
{"repository":"inboxxobni/sh-guide-notes","create":true,"visibility":"public","changes":2,"listing":{"id":"inboxxobni.sh-guide-notes","placement":{"category":"business"},"license":"MIT","tag":"v0.1.0"}}
```

Only a person's `yes` at the terminal sends it; an agent gets the plan and cannot answer. A file that holds a secret stops the share, and a private app never
goes to a public repository. The repository gets the topic `acrylblends-blend` and a release tag `v0.1.0`; the store finds it by that topic.

The store's sync runs hourly (to see it sooner, the Deploy workflow of the store's repository can be run by hand). Once the sync had run,
`https://acrylblends.github.io/blends/b/inboxxobni.sh-guide-notes/` answered 200 and read, in part: Community Blend, made and maintained by @inboxxobni, not by
ACRYL, listed automatically from its public repository and not reviewed by ACRYL; version 0.1.1 (the later release, see below); and this command for starting
a project from it:

```
npm create @acryldev/blends my-app -- --from github:inboxxobni/sh-guide-notes#v0.1.1
```

## 3. Make an app from a shared Blend

Ben, from a folder of his own, in either of the two forms:

```sh
npx acryl@latest new ben-notes --from github:inboxxobni/sh-guide-notes#v0.1.0
npm create @acryldev/blends@latest from-store -- --from github:inboxxobni/sh-guide-notes#v0.1.1
```

```
created ben-notes from sh-guide-notes (A tiny test app for the sharing guide, answering a greeting at /greeting.) in <folder>/ben-notes: 446 files, Acryl docs in docs/framework
Next:
  cd ben-notes
  npm install
  see README.md or the package.json scripts
```

`cd ben-notes && npm install && npm run dev` starts it. The app is Ben's: its history starts at one commit, and it remembers where it came from
(`package.json` `acryl.from`) so that it can be updated.

An official starter has a short id (`npx acryl new my-app --from acrylblends.csv-explorer`). A Community Blend has the id the store shows
(`inboxxobni.sh-guide-notes`), and that works the same way: the id is looked up in the store's list of Community Blends and the app is made from the release
the store lists, as if you had written its `github:` form. The app remembers that release, so `update` works. When neither the starters nor the Community list
know an id, the error says so.

## 4. Release a newer version

Ana changes the app and shares again. `npm run share` alone pushes the change; to release a new version for people to update to, share with `--list`, which
moves past a version that is already tagged:

```sh
npm run share -- --list
```

```
Share this app to https://github.com/inboxxobni/sh-guide-notes.git (public): the versions saved so far. Listed in the Blends store as inboxxobni.sh-guide-notes, Community, under business (licence MIT, people start from v0.1.1).
Type yes to send it: yes
shared to https://github.com/inboxxobni/sh-guide-notes.git
listed in the Blends store from v0.1.1: acrylblends.github.io shows it within about an hour
```

`blend.yaml` now says version 0.1.1 and the repository has the tags `v0.1.0` and `v0.1.1`.

## 5. Update an app, keeping its own changes

Inside Ben's app, which has a file of his own (`BEN-NOTES.md`), committed:

```sh
npx acrylblends@latest update
```

Write it with `@latest`: plain `npx acrylblends update` runs the copy installed in the app, which may be older than the fixes for what you want to update.

```
ben-notes was made from github:inboxxobni/sh-guide-notes 0.1.0. Asking the repository for its latest release...
github:inboxxobni/sh-guide-notes 0.1.1 is available.
Getting github:inboxxobni/sh-guide-notes v0.1.1 (@acryldev/create-blends@1.7.21, as the app was made)...
created ben-notes from sh-guide-notes (...) in <temporary folder>/ben-notes: 446 files, Acryl docs in docs/framework
Merging github:inboxxobni/sh-guide-notes 0.1.1 into ben-notes (your changes are kept)...
Installing its dependencies (npm install)...
Updated to github:inboxxobni/sh-guide-notes 0.1.1.
```

Afterwards `plugins/greeting/index.ts` answered Ana's new text and `BEN-NOTES.md` was still there.

When Ben and the release changed the same lines, nothing is written:

```
github:inboxxobni/sh-guide-notes 0.1.2 is available.
Merging github:inboxxobni/sh-guide-notes 0.1.2 into ben-notes (your changes are kept)...
error: you and github:inboxxobni/sh-guide-notes 0.1.2 both changed the same lines of: plugins/greeting/index.ts. Nothing was changed; ask the agent to bring in github:inboxxobni/sh-guide-notes 0.1.2 by hand, or undo your change there and update again
```

## 6. Put it online on WebBoxes.ai

[WebBoxes.ai](https://webboxes.ai) runs ACRYL apps for you. In ACRYL Control Center, an app you shared to GitHub as Public has a **Deploy to WebBoxes.ai**
button on its card, and a Blend in the store has one on its card too. The button only opens WebBoxes.ai in your browser with the repository filled in
(`https://github.com/<owner>/<repo>` and a name made of lower case letters, digits and dashes); there you sign in, press Create, then Publish.

This part was **not run** for this guide: it needs a WebBoxes.ai account, and what happens on WebBoxes.ai (including how a box takes a newer release of the
Blend) is that product's own and is not described here.

## What this guide does not cover

- Sharing to a private repository works with the same command and `--visibility private`; the store lists public Blends only. It was not run here.
- A Blend is shared through GitHub only. npm is a target for single plugins, not for whole apps: see [Share a plugin](share-plugins.md).
- Control Center and the frame have buttons for these steps; the guide shows the commands because they can be copied and run once.
