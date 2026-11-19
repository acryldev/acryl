# T015 cut-over preparation: acrylblends/acrylblends becomes a pointer

Prepared 2026-11-19 against `acryldev/acryl` `89600dee`. Nothing here has been pushed, edited on GitHub or published:
every outward step below needs the owner's go. The old repository keeps its history; the code lives in
`acryldev/acryl/tree/main/framework` since spec 051.

## What the cut-over does

1. `acrylblends/acrylblends`' `README.md` becomes a pointer (text in section 1).
2. Its repository description says where it went (section 2).
3. Its two open pull requests are ported to `acryldev/acryl`; its open issues (none today) would be transferred (section 3).
4. The npm metadata that still names the old repository is fixed in `acryldev/acryl` before the next publish (section 4).
5. The repository is archived (section 5); the printed commands are in `t015-cutover.sh`.

## 1. The new README.md (exact text to commit in acrylblends/acrylblends)

Replace the whole file with:

````markdown
# ACRYL Blends moved

This repository moved into the ACRYL monorepo: **https://github.com/acryldev/acryl/tree/main/framework**

- Framework documentation: https://github.com/acryldev/acryl/tree/main/framework (start at `framework/README.md`)
- Website: https://acrylblends.github.io
- Issues and pull requests: https://github.com/acryldev/acryl/issues

Nothing here is needed to use it. Making an app is unchanged:

```bash
npm create acrylblends@latest my-app
cd my-app && npm install && npm run dev
```

`npm create acrylblends@latest` and `npx acrylblends` keep working, and the package names and versions are unchanged.

This repository stays as a pointer with its history; new issues and pull requests belong in
[acryldev/acryl](https://github.com/acryldev/acryl).
````

## 2. Repository description (exact text for `gh repo edit`)

```
MOVED to https://github.com/acryldev/acryl/tree/main/framework - the ACRYL Blends Cordis framework. npm create acrylblends@latest still works; history stays here.
```

Keep the homepage (`https://acrylblends.github.io`) and the topics as they are.

## 3. Open issues and pull requests (2026-11-19)

- Open issues: **none** (`gh issue list -R acrylblends/acrylblends --state all` is empty too).
- Open pull requests: **2**, both by `smrifat1411`, opened 2026-11-13:

| PR | Title | On `acryldev/acryl` main today? | Plan |
| --- | --- | --- | --- |
| #5 | docs: say where an app's data lives since 1.5 (`~/.acryl/apps/<id>/`), not `.acrylblends/` | **No.** `framework/docs/desktop.md` still says `.acrylblends/electron` (lines 21 and 27), and `framework/docs/framework/getting-started/desktop.md` line 26 too. `framework/docs/getting-started.md` already names `~/.acryl/apps/<id>/` for the app's data. | Port the hunks onto a branch of `acryldev/acryl` with the paths under `framework/docs/`, open a PR there crediting the author, then close #5 with the link. |
| #4 | fix(cli): Ctrl-C on `npm run dev` lets the host finish stopping | **No.** `framework/packages/cli/src/ide-profile.ts:735` still writes `process.once(signal, ...)` in the generated host script. | Port the commit (`packages/cli/...` becomes `framework/packages/cli/...`), open a PR in `acryldev/acryl` crediting the author, then close #4 with the link. |

Port commands (print or run only after the owner's go; they push a branch, never `main`):

```bash
gh pr checkout 4 -R acrylblends/acrylblends -b port-pr-4
git format-patch --stdout origin/main..port-pr-4 > /tmp/pr-4.patch
# in a checkout of acryldev/acryl, on a fresh branch off main:
git checkout -b port/pr-4-smrifat1411
git apply --directory=framework /tmp/pr-4.patch   # the paths moved under framework/ in spec 051; conflicts are the moved docs
git push origin port/pr-4-smrifat1411
gh pr create --repo acryldev/acryl --title "<the PR title>" --body "Ported from acrylblends/acrylblends#4 by @smrifat1411."
gh pr close 4 -R acrylblends/acrylblends --comment "Continues as <new PR link>; the code lives in acryldev/acryl/framework since spec 051."
```

The same shape ports #5 (docs only; `git apply --directory=framework` maps `docs/desktop.md` to
`framework/docs/desktop.md`, and the second file to `framework/docs/framework/getting-started/desktop.md` after the move — check each hunk by hand).

If issues appear before the archive, transfer them one by one (GitHub moves issues, not pull requests):

```bash
gh issue transfer <number> acryldev/acryl
```

## 4. npm metadata audit (2026-11-19)

`npm view <pkg> repository.url homepage bugs.url`, and the same fields in each source `package.json`.

**Still pointing at `acrylblends/acrylblends` (fix the source before the next publish):**

| Published | Version | What is wrong | Source to fix |
| --- | --- | --- | --- |
| `acrylblends` | 1.5.21 | repository `acrylblends/acrylblends` (`directory: packages/cli`), homepage `acrylblends.github.io`, bugs `acrylblends/acrylblends/issues` | `framework/packages/cli/package.json`: `repository.url` = `git+https://github.com/acryldev/acryl.git`, `repository.directory` = `framework/packages/cli`, `bugs.url` = `https://github.com/acryldev/acryl/issues`, homepage = the framework docs page |
| `create-acrylblends` | 1.5.21 | the same, `directory: packages/create` | `framework/packages/create/package.json`: the same shape with `directory: framework/packages/create` |
| `@acryldev/versions` | 0.1.1 | homepage and bugs point at `acrylblends/acrylblends` (repository is right) | `plugins/acryl-versions/package.json`: homepage to `https://github.com/acryldev/acryl/tree/main/plugins/acryl-versions#readme`, bugs to `https://github.com/acryldev/acryl/issues` |
| `@acryldev/blends-frame` | 0.1.6 | the same | `plugins/acryl-blends-frame/package.json`: homepage to `.../tree/main/plugins/acryl-blends-frame#readme`, bugs to the monorepo issues |

**Missing the fields entirely (nothing points at the old repository, and nothing points at the new one either):**

| Published | Version | Source |
| --- | --- | --- |
| `@acryldev/ui` | 0.3.0 | `plugins/acryl-ui/package.json` has no `repository`, `homepage` or `bugs` |
| `@acryldev/control` | 0.2.11 | `runtime/acryl-control/package.json` has none either |

Add to both: `"repository": { "type": "git", "url": "git+https://github.com/acryldev/acryl.git", "directory": "<the folder>" }`,
`"homepage": "https://github.com/acryldev/acryl/tree/main/<the folder>#readme"`,
`"bugs": { "url": "https://github.com/acryldev/acryl/issues" }`.

**Wrong path (points at the monorepo, but not at this package):** `@acryldev/control-center` 0.1.0 has homepage
`https://github.com/acryldev/acryl/tree/main/plugins/acryl-launcher#readme`; it should be `.../tree/main/apps/acryl-control-center#readme`.

**Correct today:** `@acryldev/brand-client`, `app-shell`, `workspace`, `settings`, `sign-in`, `diagnostics`, `plugin-admin`,
`support`, `loopback-http`, `web`, `system-prompt`, `app-context` — repository, homepage (or the monorepo README) and bugs all
name `acryldev/acryl`. (`diagnostics`, `loopback-http` and `app-context` have no homepage in the source; npm shows the
monorepo README. Optional to add.)

**Legacy names (published before the `@acryldev/*` rename; no republish needed, they are superseded):**
`@acrylblends/blends-frame` 0.1.6 and `@acrylblends/app-shell` 0.1.1 still name the old repository;
`@acrylblends/web` 0.2.0 already names `acryldev/acryl`. After the cut-over, deprecate them (needs the npm token and the owner's
go): `npm deprecate "@acrylblends/<name>@*" "Use @acryldev/<name>"`.

The published versions above change only with the next release; the source fixes are what makes that release point at the
monorepo. Run the audit again after the `acrylblends` / `create-acrylblends` 1.6.0 publish (T036) to confirm the fields.

## 5. The cut-over itself

`t015-cutover.sh` in this folder prints the exact commands; it runs nothing. Order:

1. Source metadata fixes (section 4) land in `acryldev/acryl` and the next `acrylblends` / `create-acrylblends` release
   publishes them (this is the release process, not the cut-over script).
2. README pointer commit in `acrylblends/acrylblends` (section 1).
3. `gh repo edit ... --description ...` (section 2).
4. Port the two pull requests, close the originals with links (section 3).
5. `gh repo archive acrylblends/acrylblends --yes`.

The mirror alternative from the ledger (`git subtree split` from `acryldev/acryl/framework` into a read-only mirror) is not
in the script: archiving the pointer is the simpler end state, and a mirror can still be made from the monorepo later.

Owner gates: every push to `acrylblends/acrylblends`, `gh repo edit`, `gh pr close`/`gh issue transfer`, `gh repo archive`, and
every `npm publish` / `npm deprecate`. Until then this document and the printed script are the whole change.
