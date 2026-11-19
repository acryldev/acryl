# Ticket: share, pull and connect with any git forge, not only GitHub, through `forges`

Status: needs-triage (an idea, not scheduled). Raised by the owner 2026-11-12, after meeting Felix Schneider (Vienna), who works on
`forges` with its author Daniel Roe.

## The owner's words

"their project forges to store in 12+ GIT-store-Providers like github gitlab etc. via 1 single service/package that they provide ...
we can add this as idea to have additional option to store across all these from 1place"

## What forges is (read 2026-11-12, not yet tried)

- `forges` on npm, 0.3.2, MIT, https://github.com/danielroe/forges: "One client, every forge: issues, pull requests, notifications,
  checks and webhooks". One TypeScript client and one data model over GitHub, GitLab, Bitbucket, Forgejo, Gitea, Gitee, Azure DevOps,
  Cursor Origin, Tangled, Pushin.eu, Sourcehut and GitBucket; each provider declares what it supports (a capability matrix). It also
  reads repositories and their contents, including from git hosts with no collaboration features. Node 22.18 or later; token auth.
- It covers the forge's API, not git transport: pushing commits to any of these hosts is plain `git push`, which the frame's Share
  (acryl-versions) already does to whatever upstream the app has. Whether forges creates repositories is not stated; check first.

## Where ACRYL Blends is tied to GitHub today

- `plugin pull github:<owner>/<repo>@<version>@sha256:<digest>` (plugins/plugin-share/publish.ts, package.ts): releases, the
  `repository` field and the pull source are GitHub only.
- Connect GitHub and the Registry tab in the frame; the blueprint registry (acrylblends.github.io/blends).
- The Git tab's push and pull work with any remote already; PRs, issues and checks are not shown at all.

## What it could give

1. `plugin pull <forge>:<owner>/<repo>`: pull a plugin from GitLab, Codeberg (Forgejo), Gitea, Sourcehut and the rest, with the same
   digest check. Reading a release and its file is the part forges covers on every provider.
2. "Connect a forge" instead of "Connect GitHub": one sign-in screen, one token store, the provider picked from the capability matrix.
3. The frame's Git tab showing the app's pull requests, issues and checks from whichever forge it lives on.
4. Store the same app in more than one place: several remotes, one Share pushes to each (git does this; forges only names what each
   host offers).

## First step when picked

Try forges in a scratch app against GitHub and one other host (GitLab or Codeberg): list releases, read a file at a tag, create an
issue. Write down what each provider in the matrix supports for those three. Then decide whether it becomes a Cordis plugin
(`forge` service injected by plugin-share and the frame), per the one-plugin-unit rule. Talk to Felix before building on an API that
is pre-1.0.
