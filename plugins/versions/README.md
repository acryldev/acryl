# acryl-versions

Versions for the ACRYL frame: the branch's commits as save points. One Cordis plugin with a Host half and
a client half.

A version is a commit. Nothing else is stored: the log is `git log`, the branch and its upstream are
`git rev-parse` readings, and ahead/behind say whether the branch is shared. A save makes a commit; a
restore makes a **new** commit that brings a version's tree back; a share is an explicit push. History is
never rewritten.

## Host

Row id and name `acryl-versions`; injects `router` and `routerHttp`; mounts
`/api/acryl-versions` on the framework's router. Every route is private: only the app's own page on the
loopback address may call it (`ownPage` from `acryl-loopback-http/router`), answers are never cached or
sniffed, and a known path asked with another method is 405 with its `Allow`.

| Route | Body / query | Answer |
| --- | --- | --- |
| `GET /api/acryl-versions/log` | `path=<absolute worktree>`, `limit=<1..200>` (default 50) | `{ path, branch, upstream, ahead, behind, entries }` |
| `POST /api/acryl-versions/save` | `{ path, message }` | `{ entry, commit: { hash, short, subject } }` |
| `POST /api/acryl-versions/restore` | `{ path, hash }` | `{ restored, commit: { hash, short, subject } }` |
| `POST /api/acryl-versions/share-plan` | `{ path }` | `{ upstream, address, ahead, head }` |
| `POST /api/acryl-versions/share` | `{ path, confirmed: <the plan> }` | `{ pushed: true, upstream }` |

- `log` runs `git log --format=%H%x00%h%x00%an%x00%at%x00%s -n <limit>`, newest first. `branch` is null
  when HEAD is detached; `upstream` is null when the branch has none, and then `ahead` and `behind` are 0.
  An unborn branch answers with an empty list.
- `save` runs `git add -A`, then commits. It refuses an empty or over-5000-character message, an empty
  stage ("nothing to commit"), and a missing git identity, with reasons a person can act on.
- `restore` refuses while `git status --porcelain` is non-empty ("commit or discard the uncommitted
  changes first"), requires a 7-to-40 hexadecimal commit id that exists
  (`git rev-parse --verify <hash>^{commit}`), runs `git checkout <hash> -- .`, and commits with the
  message `Restore <short>`. Restoring the tree the worktree already has is a 409.
- A share sends the branch out under the person's name, so it takes two calls. `share-plan` reads what a push
  would send without sending anything: the upstream, the remote's address with any user name or token
  removed, how many versions it lacks, and the head commit. `share` takes only that plan back as `confirmed`
  (a request without one is a 400, "a share is sent only after the person confirms its plan"), reads the
  plan again, and sends nothing when it changed (a 409, "the push changed since you confirmed it; nothing
  was sent. Look at it again."). Then it runs a plain `git push` (no force, 120 s timeout) to the branch's
  upstream. A branch without an upstream is refused with "the branch has no upstream: publish it first"; a
  refused push is a 409 whose message carries the line of git's stderr a person can act on.

Errors map once: a bad request is 400, a directory that is not a repository 404, a refusal by the current
state 409, and an unexpected git failure 500 with a fixed reason (the cause goes to the log, never the
answer).

git runs through the package's own copy of the confined runner
(`ide/acryl-workspace/src/git/runner.ts`): an argument array, never a shell, a timeout, an output cap,
`GIT_OPTIONAL_LOCKS=0`, no terminal prompt, and every in-flight process aborted and reaped on disposal.
One `ctx.effect` owns the runner and both registrations.

## Client

Client plugin `acryl-versions-client`, platform `web`. It provides the `acrylVersions` service:

```ts
{ api: VersionsApi, Section: ComponentType<{ path: string }> }
```

`Section` renders the Versions section: the heading, a message input with the **Save point** button, the
log (short id, subject, relative date, author, and a "current" note on the newest), a **Restore** button
per entry (asking `window.confirm`), a **Share** button that first shows the plan as a question ("Push 2
versions to origin/main (github.com/ana/notes)?", Cancel focused, then Push), and inline status and error text. It renders
nothing for an empty path and never throws on a failed request: the Host's reason is shown. Copy is
English only and the styles are the `acrylVersions*` classes, installed for the plugin's lifetime.

## Tests

- `tests/versions.spec.ts` drives a real git repository in a temp directory: log order and shape, save of
  staged and unstaged changes, restore as a new commit with history intact, restore refused while dirty,
  share refused without an upstream, the plan, a successful push of it to a local bare remote, nothing sent
  when a version was made after the yes, and the address without credentials.
- `tests/route.spec.ts` calls the route app over HTTP with the loopback admission: log, a malformed body
  (400), a non-repository (404), a dirty restore (409), and a share without a confirmed plan (400).
- `tests/versions-section.spec.tsx` (jsdom) renders entries, shows an API error instead of throwing,
  sends the typed save message, and restores only after confirmation.
