# The workshop registry (acryldev/workshop-2026-11-20)

A community registry where anyone with a GitHub account publishes an acrylblends app by pull request. Built for the 2026-11-20 workshop and kept open afterwards. The repository's files are in `workshop-registry/` of this repository (with the tests of its rules); the live copy is <https://github.com/acryldev/workshop-2026-11-20>.

## Design

- **Layout:** the registry layout `create-acrylblends --registry` reads: `index.json` and `blends/<id>/`. Pull an entry with `npm create acrylblends@latest my-app -- --from <id> --registry github:acryldev/workshop-2026-11-20`.
- **An attendee needs:** a GitHub account. `gh auth login` is the short way (fork, push and open the pull request are four commands, in the repository README); the website works too. `node scripts/make-entry.mjs <app> <login>.<name>` turns an app into an entry.
- **The check** (`.github/workflows/entry.yml`, `pull_request_target`): `scripts/check-pr.mjs` decides what the pull request may change (only `blends/<its author's login>.<name>/`, one entry, no moves between folders, no link), then `scripts/registry-index.ts --only <id>` checks the entry (valid public licensed `blend.yaml` through blends-core, an `acryl.template.json`, a `package.json` without install scripts, `src/`, no file over 1 MB, no more than 8 MB or 1500 files, nothing that looks like a key). A passing pull request is squash-merged with `--match-head-commit` (the commit that was checked, no other), then `index.json` and the table in the README are written and pushed by the workflow. Runs are serialised.
- **No code of a pull request is ever run.** The workflow and every script come from `main`; the pull request's commit is read with `git fetch refs/pull/N/head` and `git archive` (not `actions/checkout`, which now refuses fork code under `pull_request_target`) into a folder that is only read.
- **Unpublish:** a pull request that deletes your own folder goes through the same check and is merged; the entry leaves the index.
- **Cleanup:** none is needed for an open registry. An entry can be removed by its owner, or by an admin with a commit that also rewrites `index.json` (`scripts/registry-index.ts` and `scripts/listing.mjs`).

## Is the first-time-contributor approval needed? (the `pull_request_target` question)

No. The rehearsal pull requests came from an account that had never contributed to the repository (`webboxescompany`), and every run started at once with no "approval required" hold; the setting was left as it was and no organisation setting was changed. GitHub's documentation describes the approval for `pull_request` runs from forks and does not say it for `pull_request_target`; the observation is what settles it for this repository.

## Rehearsal (2026-10-28, account `webboxescompany`, a user account already logged in to `gh`; `inboxxobni` is a GitHub organisation, not a user)

| Case | Result | Time |
| --- | --- | --- |
| A valid app (`webboxescompany.hello`, the `nodejs` template through `make-entry`) | merged and listed | 19 s, 50 s (two runs); the add of `musichen.demo` 22 s to merge, 23 s to the index |
| Another login's folder (`someoneelse.hello`) | refused, one line saying whose folder it is | 26 s |
| Modifying a seeded entry (`acrylblends.chat`) | refused, same line | 25 s |
| A symbolic link in the entry | refused: `a link; links are not allowed` | 26 s |
| An install script (`postinstall`) | refused: names the script | 26 s |
| A 2 MB file | refused: `1953 KB; a file may be at most 1024 KB` | 27 s |
| An API key in a source file | refused: `looks like it holds an API key` | 26 s |
| A change to `.github/workflows/entry.yml` | could not be pushed by that account (GitHub refuses a token without the `workflow` scope); the path rule is covered by the unit test | - |
| Unpublish (`musichen.demo`, a pull request that deletes the folder) | merged and unlisted | 21 s to merge, 25 s to the index |

The time from opening a pull request to being listed is therefore about 20 to 50 seconds. If Actions is slow on the day the pull requests wait; nothing is lost, and a facilitator can run `scripts/registry-index.ts` and `scripts/listing.mjs` by hand and merge with `gh pr merge`. Findings fixed on the way: the pull request's files could not be read with `actions/checkout` (replaced by `git archive`), a rejected whole-app pull request produced one line per file (now one line per problem, at most 20), and the link to CONTRIBUTING was relative (now absolute).

## What it does not do

It does not review what an entry does. The README says so in its first paragraph: a community showcase, not reviewed for production.
