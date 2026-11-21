# Share a plugin: publish it, pull it, update it

A plugin is a folder in `plugins/`. Another person's app takes it from a GitHub release, from the public plugin registry, or from a list your group
keeps. Every command below was run, as two people with their own apps and their own home folders (Ana publishes, Ben pulls), against a real GitHub
organization. They run in the app's folder, with the app running (`npm run dev`, or the desktop app): a pull installs into the running app.

You need `gh` signed in (`gh auth login`) to publish, and nothing to pull a public plugin.

## 1. Make the plugin

`plugins/hello-ana/package.json` (the name and a version; the folder name is the plugin's name):

```json
{ "name": "hello-ana", "version": "0.1.0", "description": "A greeting.", "type": "module", "main": "index.ts" }
```

`plugins/hello-ana/index.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from 'acrylblends'

export const name = 'hello-ana'
export const inject = ['router']

export function apply(ctx: Context): void {
  ctx.router.route('/hello-ana', new Acryl().get('/', (c) => c.json({ text: 'hello from Ana, v0.1.0' })))
}
```

Saving the folder starts the plugin in the running app: in the frame it answers at `/app/hello-ana` (under `npm start` at `/hello-ana`). A syntax error
leaves the previous version running and says so in the log.

## 2. Publish it

```sh
npm run acryl -- plugin publish hello-ana --owner <your GitHub account or organization>
```

It prints the plan and sends nothing: the repository (new or not), the version, the license (`--license <id>`, MIT by default), the files, and that the
repository gets the topic `cordis-plugin`, which is how the public registry finds it. Only a person's `yes` at the terminal publishes; an agent gets the
plan and cannot answer. It ends with the line to give a friend:

```
npm run acryl -- plugin pull github:<owner>/hello-ana@0.1.0@sha256:<digest>
```

The same in the app: Settings > Plugins > My plugins > **Share...** on the plugin, then one of **Save here** (this computer only), **Share privately**,
**Share publicly**, **Publish to npm** or **List in the registry**. It shows the plan and asks again before it sends anything; the account field is empty for your own account.

| Target | How | Result |
| --- | --- | --- |
| GitHub | `plugin publish`, or Share publicly / Share privately | a repository and a release holding exactly the plugin's files, and the pull line |
| The public registry | `plugin publish` (always public), or **List in the registry** | the repository has the topic `cordis-plugin`; cordisplugins.github.io lists it at its next sync (hourly) |
| npm | `plugin publish <name> --to npm` | the package `@<scope>/<name>` on the npm registry (see below) |

A plugin that holds a secret is refused, naming the file.

### To npm

```sh
npm run acryl -- plugin publish hello-ana --to npm                       # as @<the account npm is signed in as>/hello-ana
npm run acryl -- plugin publish hello-ana --to npm --scope acme          # as @acme/hello-ana
npm run acryl -- plugin publish hello-ana --to npm --registry https://npm.example.com/   # another registry
```

It uses **your own** npm login and nothing else: it asks `npm whoami`, and when you are not signed in the plan is refused with `npm login`. The plan shows
the package, the registry, the version and the license before the `yes`; a version npm already has makes it the next patch. The package is public, named
`@scope/name` (the plugin's folder name is `name`). The same is the **Publish to npm** button of Share... (the account field is the scope; blank is your npm login's account). To try it without publishing, run the same command with `npm_config_dry_run=true` in the environment of
the running app: npm then stops before sending the package.

## 3. Pull it

```sh
npm run acryl -- plugin pull github:<owner>/hello-ana              # the latest release
npm run acryl -- plugin pull github:<owner>/hello-ana@0.1.0        # one version
npm run acryl -- plugin pull github:<owner>/hello-ana@0.1.0@sha256:<digest>   # exactly these bytes (the line the publisher gave)
npm run acryl -- plugin pull registry:hello-ana                    # the registry's id, checked against the integrity the registry lists
npm run acryl -- plugin pull npm:@acme/hello-ana                   # from npm: the latest version, or @0.1.1, and @sha256:<digest> to name the bytes
```

An npm package `@acme/hello-ana` is installed in the folder `plugins/hello-ana`; the checksum npm lists for the version must match the bytes that arrive. A
public package needs no login; a private scope or registry is read through your own npm configuration.

In the app: Settings > Plugins > **Registry**, search, **Add to my app** (it says it runs someone else's code and asks first); or **Add by address** for
a `github:` line from a colleague. The plugin is live at once; `blend.yaml` records where it came from, so a copy of the app fetches the same bytes.

A group's plugins in one command: put one source per line in a file (`#` starts a comment), then `npm run acryl -- plugin pull --from group.txt`. Each
line is pulled on its own; a refused one is named with its reason while the others run.

```sh
npm run acryl -- plugin list              # what is installed, where each pulled one came from and who released it
npm run acryl -- plugin remove hello-ana
```

## 4. Update it, and keep your own edits

Ana changes the plugin and runs the same `plugin publish` again: the version that is already released is not released twice, so the plan names the next
patch (0.1.1) and says so. Ben runs the same pull line he used before:

```sh
npm run acryl -- plugin pull github:<owner>/hello-ana@0.1.1
```

In the app, Settings > Plugins > Registry shows **Update to v0.1.1** instead of "Added" when the registry lists a newer release than the one pulled; it asks first and does the same as the command.

- A folder Ben never touched is replaced by the new release, live.
- A folder Ben changed is merged: the release he pulled is fetched again as the common ancestor, a file only he changed keeps his change, a file of his own stays, and
  a file both changed is merged line by line. The answer names the files that kept something of his (`kept`).
- When Ben and the release changed the same lines, nothing is written: the pull is refused naming the file, and his folder is exactly as it was. Move the folder
  out of `plugins/`, pull again, and bring his change back by hand.
- A plugin another account released under the same name is never merged: it is refused naming where the copy in the app came from.

## Try it without touching your own account

Use a throwaway GitHub organization and a second app with its own home folder, so the two people never share files. Publishing as the organization needs
`gh` signed in as one of its members: `--owner <organization>`.
