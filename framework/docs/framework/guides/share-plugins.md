# Share a plugin: publish it, pull it, update it

A plugin is a folder in `plugins/`. Another person's app takes it from a GitHub release, from the public plugin registry at
[cordisplugins.github.io](https://cordisplugins.github.io), from npm, or from a list your group keeps. To share a whole app instead, see [Share a Blend](share-blends.md).

Every command and every output below was run on 2026-11-21 as two people, Ana (publishes) and Ben (pulls), each with an app and a home folder of their own, made with
`@acryldev/blends` 1.7.21, against the GitHub organization `inboxxobni`. Outputs are pasted as they came, with the `npm run` banner lines left out. The npm steps (see "To npm") were a real publish to npm on 2026-11-22 of a throwaway package. Commands run in the app's folder with the app running (`npm run dev`, or the desktop
app): a pull installs into the running app. You need `gh` signed in (`gh auth login`) to publish; pulling a public plugin needs no login.

## 1. Make the plugin

`plugins/sh-guide-clock/package.json` (the folder name is the plugin's name):

```json
{ "name": "sh-guide-clock", "version": "0.1.0", "description": "A clock for the sharing guide.", "type": "module", "main": "index.ts" }
```

`plugins/sh-guide-clock/index.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'sh-guide-clock'
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.route('/sh-guide-clock', new Acryl().get('/', (c) => c.json({ text: 'a clock, v0.1.0' })))
}
```

Saving the folder starts the plugin in the running app: in the frame it answered `{"text":"a clock, v0.1.0"}` at `/app/sh-guide-clock` (under `npm start`, at
`/sh-guide-clock`).

## 2. Publish it

```sh
npm run acryl -- plugin publish sh-guide-clock --owner inboxxobni
```

It shows the plan and sends nothing until you type `yes`. `--owner` is the GitHub account or organization (yours when absent), `--license <id>` the license (MIT
when absent):

```
Publish to inboxxobni/sh-guide-clock (a new repository), public, version 0.1.0, license MIT.
Files: README.md, index.ts, package.json.
The repository gets the topic cordis-plugin, so the public plugin registry (cordisplugins.github.io) lists it within about an hour.
A friend gets exactly these bytes with: npm run acryl -- plugin pull github:inboxxobni/sh-guide-clock@0.1.0@sha256:64aa517d77ad481addbbc4a13e97e173bda0c31d2b01809e606153517e82ae08
Nothing was sent. Only a person can say yes: they run `npm run acryl -- plugin publish sh-guide-clock` in their own terminal, or press Share in the frame. `--license <id>` changes the license before the yes.
Publish inboxxobni/sh-guide-clock v0.1.0 under MIT? Type yes to send it: yes
Published: https://github.com/inboxxobni/sh-guide-clock/releases/tag/v0.1.0
A friend gets exactly these bytes with:
  npm run acryl -- plugin pull github:inboxxobni/sh-guide-clock@0.1.0@sha256:64aa517d77ad481addbbc4a13e97e173bda0c31d2b01809e606153517e82ae08
```

Only a person's `yes` at the terminal publishes; an agent gets the plan and cannot answer. A plugin that holds a secret is refused, naming the file.

The same in the app: Settings > Plugins > My plugins > **Share...** on the plugin, then **Save here** (this computer only), **Share privately**, **Share publicly**,
**Publish to npm** or **List in the registry**. It shows the plan and asks again before it sends anything.

| Target | How | Result |
| --- | --- | --- |
| GitHub | `plugin publish`, or Share publicly / Share privately | a repository and a release holding exactly the plugin's files, and the pull line |
| The public plugin registry | `plugin publish` (always public), or **List in the registry** | the repository has the topic `cordis-plugin`; the registry lists it at its next sync (hourly) |
| npm | `plugin publish <name> --to npm`, or **Publish to npm** | the package `@<scope>/<name>` on the npm registry (see below) |

## 3. Pull it

Ben, in his app:

```sh
npm run acryl -- plugin pull github:inboxxobni/sh-guide-clock@0.1.0@sha256:64aa517d77ad481addbbc4a13e97e173bda0c31d2b01809e606153517e82ae08
```

```
{
  "ok": true,
  "name": "sh-guide-clock",
  "version": "0.1.0",
  "integrity": "sha512-O4qRgyQU7+pl+Gih+sBcd073Wc+FejM+KNaXjBkM5ml75Hg2k/UiFs4Jr32oQg2Dbf3O73yYuyvdRf5ECZ0xqQ==",
  "digest": "64aa517d77ad481addbbc4a13e97e173bda0c31d2b01809e606153517e82ae08",
  "action": "installed",
  "state": "active",
  "remembered": true
}
```

The plugin was live at once (`{"text":"a clock, v0.1.0"}`), and `blend.yaml` remembers where it came from, so a copy of the app fetches the same bytes.
`npm run acryl -- plugin list` says who released it:

```
    "name": "sh-guide-clock",
    "state": "active",
    "pulledFrom": "github:inboxxobni/sh-guide-clock@0.1.0",
    "author": "inboxxobni",
    "release": "0.1.0"
```

The other forms of a source:

```sh
npm run acryl -- plugin pull github:<owner>/<repo>                      # the latest release
npm run acryl -- plugin pull github:<owner>/<repo>@<version>            # one version
npm run acryl -- plugin pull github:<owner>/<repo>@<version>@sha256:<digest>   # exactly these bytes (the line the publisher gave)
npm run acryl -- plugin pull registry:<id>                              # by the id the registry shows
npm run acryl -- plugin pull npm:@<scope>/<name>[@<version>]            # from npm
```

With `@sha256:<digest>` a release with other bytes is refused. By registry id (after the registry had listed the plugin):

```sh
npm run acryl -- plugin pull registry:sh-guide-clock
```

```
{
  "ok": true,
  "name": "sh-guide-clock",
  "version": "0.1.1",
  "integrity": "sha512-kFO4j0zQjgVmlP38yMttbHDRNIQLTG8wgMUtkE8DlELeBF8Ptw93uPFVrZUgaYuaCfJ5iR6TBH3E+UK8kntGAg==",
  "digest": "4efa1130533055e7a6ce94cfd54f593a6d47c88fe74a47a71c3b6d08e1ce3472",
  "action": "installed",
  "state": "active",
  "remembered": true
}
```

The registry's own listed checksum is checked against the bytes that arrive. In the app: Settings > Plugins > **Registry**, search, **Add to my app** (it says it runs
someone else's code and asks first), or **Add by address** for a `github:` line from a colleague.

A group's plugins in one command: put one source per line in a file (`#` starts a comment), then `npm run acryl -- plugin pull --from group.txt`. Each line is
pulled on its own; a refused one is named with its reason while the others run. `plugin remove <name>` takes one out; its folder goes too when it is exactly the
release as pulled, and stays (with the app starting it again at its next start) when you changed it.

If a pull says `GitHub answered 403`: GitHub allows 60 requests an hour without a sign-in, counted per internet address, so a room full of people on one network
can use it up together; it came back after the hour. From `@acryldev/plugin-share` 0.1.6 a pull uses your `gh` login when GitHub refuses the anonymous request, and
the refusal then says "sign in with `gh auth login`".

## 4. Update it, and keep your own edits

Ana changes the plugin and runs the same `plugin publish` again: a version that is already released is not released twice, so the plan names the next patch
(0.1.1). Ben, who has added a file of his own (`BEN.md`) and a comment line to `index.ts`, pulls the new release the same way:

```sh
npm run acryl -- plugin pull github:inboxxobni/sh-guide-clock@0.1.1@sha256:4efa1130533055e7a6ce94cfd54f593a6d47c88fe74a47a71c3b6d08e1ce3472
```

```
{
  "ok": true,
  "name": "sh-guide-clock",
  "version": "0.1.1",
  "integrity": "sha512-kFO4j0zQjgVmlP38yMttbHDRNIQLTG8wgMUtkE8DlELeBF8Ptw93uPFVrZUgaYuaCfJ5iR6TBH3E+UK8kntGAg==",
  "digest": "4efa1130533055e7a6ce94cfd54f593a6d47c88fe74a47a71c3b6d08e1ce3472",
  "action": "updated",
  "state": "active",
  "remembered": true,
  "kept": [
    "BEN.md",
    "index.ts"
  ]
}
```

The plugin served the new text (`{"text":"a clock, v0.1.1"}`), `BEN.md` was still there and the first line of `index.ts` was still Ben's comment. What it does:

- A folder you never touched is replaced by the new release, live.
- A folder you changed is merged: the release you pulled is fetched again as the common ancestor, a file only you changed keeps your change, a file of your own stays,
  and a file both changed is merged line by line. The answer names the files that kept something of yours (`kept`).
- When you and the release changed the same lines, nothing is written. Ben changed the line the release also changed:

```
refused: plugins/sh-guide-clock has changes of your own to index.ts, and the new release changes it too. plugins/sh-guide-clock is untouched: move it out of plugins/ and pull again, then bring your changes back by hand.
```

- A plugin another account released under the same name is never merged: it is refused, naming where the copy in the app came from.

In the app, the Registry tab shows **Update to v0.1.1** instead of "Added" when the registry lists a newer release than the one you pulled; it asks first and does
the same as the command.

## To npm

```sh
npm run acryl -- plugin publish sh-guide-clock --to npm --scope <your-npm-account>
```

It uses **your own** npm login and nothing else: it asks `npm whoami`. The package is named `@<scope>/<plugin folder>`: the scope is the account of that login,
or `--scope`. (The door publishes scoped names only; `plugin pull` also takes an unscoped package.) `--registry <address>` names another registry. A version npm
already has makes it the next patch. The plan and the `yes` are the same as for GitHub. This is the real run of 2026-11-22, a throwaway plugin
`acryl-share-proof-1122` published by the npm account `webboxescom` (nothing was simulated; the package was deprecated afterwards):

```
Publish to npm as @webboxescom/acryl-share-proof-1122 (registry https://registry.npmjs.org/, signed in as the account of your own npm login), public, version 0.1.0, license MIT.
Files: README.md, index.ts, package.json.
A friend gets exactly these bytes with: npm run acryl -- plugin pull npm:@webboxescom/acryl-share-proof-1122@0.1.0@sha256:1e09c3ba3253cb78ac8457c75e5ec417a9fbddb30a2b84140f0e3a4daf42c6ec
Publish @webboxescom/acryl-share-proof-1122 v0.1.0 under MIT? Type yes to send it: yes
Published: https://www.npmjs.com/package/@webboxescom/acryl-share-proof-1122
```

npm answered the upload with `202` ("your package is being processed and may take a few minutes to become available"): the package was listed about five minutes
later (0.1.1 about three minutes later), and until then `npm view` and a pull say `404` / "npm has no ...". Wait, then pull. Ben, in his own app with no npm login:

```sh
npm run acryl -- plugin pull npm:@webboxescom/acryl-share-proof-1122
```

```
{
  "ok": true,
  "name": "acryl-share-proof-1122",
  "version": "0.1.0",
  "integrity": "sha512-2UZh8hxoOnZoordA3z3/CgDv/S85t0VMfpo308q77ztkSiqOtPFDCXC7vXPqPqks1GctZ3uAC4JkEgAE1OzIwA==",
  "digest": "1e09c3ba3253cb78ac8457c75e5ec417a9fbddb30a2b84140f0e3a4daf42c6ec",
  "action": "installed",
  "state": "active",
  "remembered": true
}
```

The digest is the one the publisher's plan printed, and the plugin answered at once (`{"text":"proof, v0.1.0"}`). An update works as for GitHub: Ana published 0.1.1 (the
plan named the next patch itself); Ben, who had added `BEN.md` and a comment line to `index.ts`, pulled again and kept both:

```
{
  "ok": true,
  "name": "acryl-share-proof-1122",
  "version": "0.1.1",
  "integrity": "sha512-QGHk5W2SUip3AUGBO9UbI7kzMlJsLwLJvUoQtCICgVIJiV01rSA/6JCA7RILxiey1ddcHMemkbcOnd+Iz9oo0A==",
  "digest": "0f4385f83e9efaa80430762ca89b6248a38fdff9bdd11f4243d3202f4c14fedd",
  "action": "updated",
  "state": "active",
  "remembered": true,
  "kept": [
    "BEN.md",
    "index.ts"
  ]
}
```

Signed out, the plan is refused and says how to sign in:

```
refused: npm whoami failed: you are not signed in to npm on https://registry.npmjs.org/ (sign in with: npm login --registry https://registry.npmjs.org/). fix it, or sign in with: npm login (--registry <address> for another registry); nothing was sent.
```

In the app, Settings > Plugins > **Share...** > **Publish to npm** does the same (the account field is the scope), and the card then reads "Shared on npm" with a
copyable pull line. Taking a package back: `npm unpublish <package> --force` works within 72 hours, but npm refuses it for an access token that skips two-factor
(`403 ... Granular access tokens that bypass two-factor authentication may not perform this action`), so run it signed in with two-factor, or use
`npm deprecate <package> "<message>"`, which that token may do.

## Try it without touching your own account

Use a throwaway GitHub organization and a second app with its own home folder, so the two people never share files. Publishing as the organization needs `gh`
signed in as one of its members: `--owner <organization>`.
