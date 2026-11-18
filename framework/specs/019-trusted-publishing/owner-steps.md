# Owner steps for trusted publishing (about 10 minutes)

The workflow `.github/workflows/release.yml` is on `main`. It holds no token. Until these steps are done, releases keep going out with the current token and nothing breaks.
Only you can do these: they need your npmjs.com and GitHub logins.

## 1. GitHub: create the approval gate (once)

1. Open https://github.com/acrylblends/acrylblends/settings/environments and choose "New environment".
2. Name it exactly `npm-release`.
3. Tick "Required reviewers" and add yourself. Save protection rules.
4. Optional: under "Deployment branches and tags", choose "Selected branches and tags" and add the tag patterns `v*` and `create-v*`.

## 2. npmjs.com: link each package to the workflow (once per package, twice in all)

Do this for `acrylblends` and then for `create-acrylblends`.

1. Open https://www.npmjs.com/package/acrylblends/access (then the same for `create-acrylblends`). You must be logged in with 2FA.
2. Find "Trusted Publisher" and choose "GitHub Actions".
3. Fill in exactly:
   - Organization or user: `acrylblends`
   - Repository: `acrylblends`
   - Workflow filename: `release.yml`
   - Environment name: `npm-release`
4. Save. npm checks nothing yet; a typo shows up as a failed publish later, so re-read the four values.

## 3. Prove it with one release

Ask the agent to cut the next patch. It will push a tag (`v<version>`), the workflow will run its checks and then wait. Open the run on GitHub (Actions tab), choose "Review deployments", approve `npm-release`. The version appears on npm with a "Built and signed on GitHub Actions" provenance badge.

## 4. Lock it down (only after step 3 worked for both packages)

1. On each package's access page choose "Require two-factor authentication and disallow tokens" and save.
2. Revoke the old bypass-2FA token at https://www.npmjs.com/settings/~/tokens, and delete its copy in `~/.secure-storage/npm/`.

Dry run at any time: GitHub, Actions, "release", "Run workflow". It runs every check and `npm publish --dry-run`; it never publishes.
