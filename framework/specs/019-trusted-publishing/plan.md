# 019 - publishing acrylblends and create-acrylblends with npm trusted publishing

Status: plan only, nothing set up. The release token in use today is a granular token that bypasses 2FA; npmjs.com announces that such tokens are being restricted (account changes from August 2026, direct
publishing from January 2027). The replacement is trusted publishing: GitHub Actions proves its identity to npm with OIDC, so no long-lived token exists and each release carries provenance.

Details of npm's current rules (minimum npm and Node versions, field names on the npmjs.com page) are written from memory of npm's documentation and must be checked against https://docs.npmjs.com/trusted-publishers
when the owner sets it up; this plan says where each one matters.

## What changes

| Today | After |
| --- | --- |
| a person publishes from a terminal with a token read from `~/.secure-storage` | a GitHub Actions workflow in `acrylblends/acrylblends` publishes; no token is stored anywhere |
| the gates run on the person's machine | the workflow runs `pnpm run check` (lint, build, framework drift, typecheck, 3,000+ tests, scaffolder verification) before it publishes |
| no provenance | each version shows "Built and signed on GitHub Actions" with a link to the commit and the run |

The manual gates that need a display or a model (`verify-desktop`, `verify-coding-agent`) stay manual and are run before a release is tagged; the workflow cannot run them.

## The workflow (`.github/workflows/release.yml`)

Trigger: a pushed tag, `v<version>` for `acrylblends` and `create-v<version>` for `create-acrylblends` (two tag patterns in one workflow), plus `workflow_dispatch` to re-run a failed publish for an existing tag.

Shape (the file is written and tested in a throw-away repository first, then added here):

```yaml
name: release
on:
  push:
    tags: ['v*', 'create-v*']
permissions:
  contents: read
  id-token: write          # lets the job ask GitHub for the OIDC token npm exchanges for a publish credential
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm-release          # a GitHub Environment with a required reviewer: the owner approves each publish
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, registry-url: 'https://registry.npmjs.org' }   # npm 11.5.1 or newer is needed for trusted publishing
      - run: pnpm install --frozen-lockfile
      - run: pnpm run check
      - name: Pack and publish the package the tag names
        run: |
          case "$GITHUB_REF_NAME" in
            v*)        dir=packages/cli ;;
            create-v*) dir=packages/create ;;
          esac
          test "$(node -p "require('./$dir/package.json').version")" = "${GITHUB_REF_NAME#*v}"   # the tag is the package version
          pnpm --dir "$dir" pack --pack-destination "$RUNNER_TEMP"
          npm publish "$RUNNER_TEMP"/*.tgz --access public --provenance
```

Why `pnpm pack` then `npm publish` of the tarball: `pnpm pack` turns `create-acrylblends`'s `workspace:^` dependency into the real range, which `npm publish` from the folder would not.
No `NODE_AUTH_TOKEN` and no repository secret: that is the point. Third-party actions are pinned to a commit SHA when the file is written.

## What the owner clicks on npmjs.com (only the owner can: it needs their login and 2FA)

For each of the two packages, `acrylblends` and `create-acrylblends`:

1. Open the package, then Settings, then "Trusted Publisher", and choose GitHub Actions.
2. Fill in: organization `acrylblends`, repository `acrylblends`, workflow filename `release.yml`, environment `npm-release`.
3. Save. (npm checks nothing until the first publish; a typo in these four values shows up as a publish failure, not here.)
4. After one successful trusted release of each package, set the package's publishing access to "Require two-factor authentication and disallow tokens", then revoke the old bypass-2FA token on the account.

On GitHub (repository settings, also the owner): create the Environment `npm-release` with the owner as required reviewer; optionally restrict it to the tags `v*` and `create-v*`.

## How a release is triggered

1. On a branch: bump the version (`packages/cli/package.json` or `packages/create/package.json`), write `docs/release-notes/<version>.md`, run the manual gates, merge to `main` with CI green.
2. Tag the merge commit: `git tag v0.6.2 && git push origin v0.6.2` (or `create-v0.1.3`). The workflow starts and waits for the reviewer.
3. The owner approves the run on GitHub; it publishes and the version appears with provenance. The release is done when `npm view <package> dist-tags.latest` shows the version.
`create-acrylblends` is tagged after `acrylblends` when both change, because it depends on the new `acrylblends` version.

## Risks and limits

- Trusted publishing is configured per package; a new package (a future `acryl` rename, for instance) needs the same four fields before its first CI publish. The first publish of a brand-new name still needs a one-time manual publish or an npm-side placeholder.
- A workflow file rename or a repository rename breaks the link silently until the next publish fails: the Trusted Publisher fields must be updated with it.
- The OIDC token only proves "this workflow in this repository"; anyone who can push a tag the Environment allows can request a release, which is why the Environment's required reviewer is part of the plan and not optional.
- Provenance needs a public repository and public packages (both true today).
