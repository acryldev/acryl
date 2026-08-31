# Terminal Distribution Validation Quickstart

The governing scope is [`spec.md`](./spec.md). This feature validates one terminal-first npm package plus independent archive and Desktop payload checks.

1. Run the clean candidate-tarball measurement script. It must create a new work directory, prefix, npm install cache, HOME, and isolated PATH; install the packed candidate globally; and run the installed `acryl --version` and `acryl tui --json`.
2. Inspect the resulting measurement JSON. The canonical package metric is unique realpath-deduplicated package roots below the resolved globally installed `acryl` package root. Compare it with the recorded v0.1.17 baseline.
3. Run the terminal closure test. It must reject the named Web/client UI, Market, Canvas, package-manager, and Web-host package IDs in both the package manifest and installed tree.
4. Independently run target archive and Desktop package checks. Their byte reductions do not satisfy the npm-install acceptance gate.

## Deferred work

Optional capability distribution, generic capability metadata, shared runtime composition, remote transports, local runtime servers, and attachable clients are not part of this feature. They require separate specifications.
