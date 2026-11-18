# workshop-2026-11-20: a community registry of acrylblends apps

Apps people made with [acrylblends](https://acrylblends.github.io), published here by pull request and listed in seconds. It started as the registry for the 2026-11-20 workshop and **stays open**: anyone with a GitHub account can add an app.

> **A community showcase, not reviewed for production.** An entry is somebody else's code. Nothing here runs by itself: `create-acrylblends` downloads and unpacks an entry and runs nothing, and the checks below refuse links, install scripts, keys and oversized files. But a check is not a review. Read an app before you run it, and do not deploy one you have not read.

## Start from an entry

```sh
npm create acrylblends@latest my-app -- --from acrylblends.notes-desktop --registry github:acryldev/workshop-2026-11-20
cd my-app
npm install
npm run dev
```

(npm needs the `--` before the options.) The entries:

<!-- entries:start -->
<!-- entries:end -->

## Publish your app

You need a GitHub account (and `gh auth login` makes the steps below shorter; the website works too). Your app is an `acrylblends` app you made with `npm create acrylblends@latest`.

Every version the frame saves is a captured snapshot. `make-entry.mjs` checks the app against its `blend.lock.json` and refuses one changed since the last capture, naming what changed: run `npm run snapshot capture` in the app (or Save point in the frame) and try again.

```sh
gh repo fork acryldev/workshop-2026-11-20 --clone && cd workshop-2026-11-20
node scripts/make-entry.mjs ../my-app <your-github-login>.my-app --description "what it does"
git add blends && git commit -m "add <your-github-login>.my-app" && git push
gh pr create --fill --repo acryldev/workshop-2026-11-20
```

A check runs on the pull request. When it passes, the pull request is merged and your app is listed, usually within two minutes. When it does not, a comment says what to change; push again and it re-checks. The rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Take it down

A pull request that deletes your own folder (`git rm -r blends/<login>.my-app`) is checked the same way and merged. Only you can remove or change an entry named after your login.

## How it is kept safe

- Your pull request may change only `blends/<your login>.<name>/`; not another login's folder, the index, a script or a workflow.
- The check never runs your code: the workflow is this repository's own, your files are read as data, and every script that runs comes from `main`. The merge is of the exact commit that was checked.
- An entry may hold no link, no `node_modules`, no install script, no file over 1 MB, nothing over 8 MB or 1500 files, nothing that looks like a key, and must be a valid public, licensed `blend.yaml` with an `acryl.template.json`.
- `index.json` is written by this repository's workflow, never by a pull request.

Found a problem with an entry? Open an issue.
