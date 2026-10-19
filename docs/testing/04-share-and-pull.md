# 4. Share and pull plugins

About 25 minutes. You need `gh` signed in, and a GitHub organization or account made for testing (sharing creates repositories and releases). For the
optional npm part, an npm login (`npm login`) and a scope you own.

Use the Pomodoro or GitHub-issues plugin from guide 3, or the habit tracker from guide 2. Everything below works in any app's chat as `/plugin ...`,
and from the terminal as `acryl plugin ...`. The agent can do it too ("share my pomodoro plugin to GitHub"); it asks before anything leaves your
machine.

## 4.1 Keep versions

```
/plugin saved                      what this app's plugin store keeps, every version
/plugin save <name>                pack the plugin you edit and keep this version
/plugin version patch <name>       a fix: the next version (minor, major the same way)
```

Expected: `saved` lists each version with its checksum; `save` refuses a folder without a name or a semantic version.

## 4.2 Share to GitHub

```
/plugin share <name>                         a private repository under your account, a release with the packed plugin
/plugin share <name> <your-test-org>/<repo>  into a given organization and repository
/plugin share <name> public                  public
```

Expected: a repository with exactly the packed files, a tag and a release for the version. Sharing refuses a plugin that contains secrets (it names
what it found) and refuses to make a private plugin public by accident. Check the repository on GitHub.

## 4.3 Pull into another app

Start a second app (`acryl new pull-test`, `pull-test/bin/acryl web`) and in its chat:

```
/plugin pull github:<owner>/<repo>            the latest release
/plugin pull github:<owner>/<repo>@0.1.0      an exact version
/plugin pull store:<name>                     from this machine's store
/plugin pull <path or https URL>.tgz          a packed file
/plugin update <name>                         the newest release, from where it came from
```

Expected: the plugin is fetched, checked against its sha512 and installed; it works without a restart (some plugins say "restart the app to load
it"). A public sample to pull: `github:inboxxobni/acryl-quick-notes@0.3.0`.

Then `/blend snapshot` in that app: the pulled plugin is recorded by its source and checksum, and `acryl new copy --from ./pull-test` fetches it again
(guide 2.4).

## 4.4 npm (optional)

```
/plugin share <name> npm                         publishes with your npm login; a private plugin needs a scope (@you/name)
/plugin share <name> npm public <registry URL>   another registry
/plugin pull npm:<name>                          installs it
```

## 4.5 What to look for

- Does a pulled plugin behave the same as in the app that made it?
- Does a changed tarball fail the checksum check? (Edit a byte of a downloaded `.tgz` and pull it: expected, a refusal naming the mismatch.)
- Are the error messages clear when GitHub, npm or the network refuses?
