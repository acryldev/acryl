# plugin-share

Share plugins between people. Pull a plugin someone released into your running app, and publish your own as a plan a person confirms.

## Pull

```
npm run acryl -- plugin pull github:<owner>/<repo>@<version>
```

`registry:<id>` pulls what the public plugin registry (cordisplugins.github.io) lists under that id, checked against the integrity it lists.

The line someone gives you after publishing also carries `@sha256:<digest>`. Then a release with different bytes is refused, with exit 1, and nothing changes.

A newer release of a plugin you already pulled updates it in place. A folder you never touched is replaced. A folder you changed is merged three ways
(the release you pulled, your folder, the new release; `merge-edits.ts`): a file only you changed keeps your change, a file both changed is merged line by
line with git, and when the same lines changed nothing is written and the pull is refused naming the file. The answer lists the files that kept your changes (`kept`).

The app must be running (`npm run dev`), because the pull installs into it live. A stopped app never installs offline: the line exits 3 and asks you to start the app and run the same line again.

The app remembers where each pulled plugin came from, in the `plugin-share` row of `blend.yaml`. A copy of the app fetches the same bytes at its next start.

A plugin whose route or home widget another plugin already has is refused, and the message names that plugin. A different copy of a plugin with the same name is refused too, and the message says where the copy in the app came from.

### Native packages

A pull installs no `dependencies`. A plugin that needs a large, per-OS npm package (an engine, a native library) declares it instead,
one entry per OS and CPU, each pinned by npm's sha512 of the tarball (`npm view <package>@<version> dist.integrity dist.unpackedSize`):

```json
"acrylblends": {
  "native": [
    { "package": "@deepseek-ai/libreoffice-kit-darwin-arm64", "version": "0.1.5", "os": "darwin", "cpu": "arm64",
      "integrity": "sha512-...", "size": 153171456 }
  ]
}
```

Leave `cpu` out for a build that runs on any CPU of that OS (a WebAssembly one). The pull downloads only this computer's entry, from the
npm registry, checks its sha512, unpacks it into the app's home (`native/`) and links `node_modules/<package>` to it before the plugin
starts. It replaces only a missing package or the frame's empty placeholder (`@acryldev/absent`); a copy npm installed stays. Removing
the plugin removes the link and the download. An `npm install` puts the placeholder back; the app's next start links the download again.
A plugin's entries may unpack to 1 GB at most. The code is `native.ts`.

## List and remove

```
npm run acryl -- plugin list
npm run acryl -- plugin remove <name>
```

The list names each plugin installed while the app runs, its version and state. A pulled one also shows the source it came from and its author, the GitHub account that released it.

Remove takes the plugin out of the running app and forgets its record. Its folder goes too when it still holds the release exactly as pulled; the pull line brings it back. A folder with someone's work in it stays, and the answer says so: the app's own plugin, or a pulled one changed since. The app then starts it again at its next start unless you delete the folder.

Both work in the frame as well.

## Publish

```
npm run acryl -- plugin publish <name> [--owner <account>] [--license <id>]
```

It prints the plan: account, repository, version, visibility and license. Only a person's yes at the terminal publishes. Declining sends nothing. An agent gets the plan and cannot say yes. The output ends with the pull line to give to others.

## An app made by an older version

Every new app has this plugin, except one made from the todo template, which installs nothing live. `upgrade` does not add it to an older app, so add it and mount it by hand:

```
npx acrylblends add plugin-share
npm install
```

In `src/app.ts`, import it, add it to the registry and give it the plugins folder:

```ts
import { pluginShare } from '../plugins/plugin-share/index.ts'
// in the registry
'plugin-share': pluginShare,
// in the configuration passed to compose
'plugin-share': { dir: extensionsDir },
```

In `blend.yaml`, add the row after `builder`:

```yaml
    - id: plugin-share
      name: plugin-share
```

Then restart the app.
