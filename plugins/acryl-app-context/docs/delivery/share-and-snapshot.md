# Share, versions and blueprints: one snapshot

The app is `blend.yaml` + `plugins/` + `src/`. Every way the app is kept or passed on reads exactly that, so a plugin built as a folder with its
row is in all of them without any export step:

- **A version** is a commit of the app folder. The frame saves one after the chat's turn changed files ("saved as vN" under the turn), and the
  left panel lists the versions of the branch. Going back to a version restores its `blend.yaml` and `plugins/`, and the canvas follows: a
  plugin added after that version is gone, and comes back with the newer version.
- **A shared plugin** is one folder of `plugins/`, packaged for the CordisPlugins registry (https://cordisplugins.github.io/plugins): Settings >
  Plugins > Share on the plugin's row writes its `package.json` and Loader patch, checks it holds no secret, says what it will create (the
  GitHub repository, the version, private or public) and publishes only on the person's yes, through their own `gh` and `git` login, then
  shows the repository and version on the row. Another app takes it as a folder in its `plugins/` plus a row.
- **A blueprint** is a copy of the app folder (without `node_modules`, `.git` and data) as an entry of a Blends registry; an app made from it
  starts the same rows, its own plugins included.

## The snapshot verbs

`blend.lock.json` records the snapshot: the digest of `blend.yaml` and of every plugin folder. `npm run snapshot <verb>` keeps it honest:

- `capture` gives every plugin folder of the app's own a row if it has none (a folder installed live becomes part of the composition; the person's
  comments in `blend.yaml` are kept) and writes the lock again. Run it before a version, a share or a blueprint when you added a folder.
- `verify [folder]` checks a snapshot against its lock, offline: it names `blend.yaml` or the plugin folder that changed since the capture.
- `apply <folder>` brings another snapshot of the app into this one: its rows and the plugin folders this app lacks. It writes nothing when a
  plugin folder here differs from the snapshot's (somebody's work is never overwritten), and a plugin folder the snapshot does not have stays
  where it is, on the `extensions` row's `off` list. Ask the person before you apply.

In the frame the same verbs are your tools `acryl_snapshot_capture`, `acryl_snapshot_verify` and `acryl_snapshot_apply` (the frame runs the
app's own `plugins/manifest/snapshot.ts`). Every version the frame saves (the save after your turn, the person's **Save point**) is captured
first, so a version always holds the rows and the lock of what it saved. The `↑`/`↓` chips next to **Save point** send the branch's versions to
its remote and bring the remote's new ones in (fast-forward only, never forced): those are the person's, not yours.

## What you do, and what only the person does

- Before anything is shared, the plugin must work: [verify before done](../start-here/verify-before-done.md). Give it a doc comment whose first
  sentence says what it does: it becomes the package's description.
- Sharing sends the person's work to GitHub under their name. Never share, push or publish yourself: tell the person to press **Share** on the
  plugin's row in Settings > Plugins. Never ask for or handle a token.
- A fix to a plugin that was already shared needs a new version: Share again plans the next patch version, and the question names it.
