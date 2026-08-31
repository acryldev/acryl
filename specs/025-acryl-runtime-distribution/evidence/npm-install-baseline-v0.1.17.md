# ACRYL npm install baseline: v0.1.17

**Status:** Fresh published-tarball baseline for the terminal-distribution milestone.

## Environment

| Field | Value |
| --- | --- |
| Platform | Darwin 25.5.0 arm64 |
| Node | v24.19.0 |
| npm | 11.17.0 |
| Package | `acryl@0.1.17` from npm registry |
| Tarball bytes | 478,693 |

## Isolation and timing policy

A new temporary work directory was created for this run. The tarball was acquired before timing. Tarball acquisition is preparation, not installation time.

The timed command used a new prefix and npm cache, with no inherited global `acryl` path:

```sh
npm install --global --prefix "$work/prefix" --cache "$work/cache" \
  --ignore-scripts --no-audit --no-fund "$work/acryl-0.1.17.tgz"
```

A future harness will additionally isolate `HOME` and `PATH`, and discover the installed root with `npm root --global --prefix "$work/prefix"` in that same environment.

## Measurements

| Metric | Value | Budget role |
| --- | ---: | --- |
| Install wall time | 24.124 s | Candidate may not increase by more than 10% |
| Published direct dependencies | 536 | Informational, must decrease |
| Canonical installed package count | 557 | Candidate must reduce by at least 20% |
| `npm ls --all` package paths | 558 | Informational only |
| `package.json` files below global modules | 639 | Informational only |
| Installed closure size | 244,467,079 bytes | Candidate must reduce by at least 20% |
| Installed closure files | 32,260 | Informational |

The canonical package count and byte total are emitted by `scripts/measure-npm-install.mjs`. The byte total is the sum of regular file sizes; it deliberately differs from `du` allocated-block totals. Do not use `npm ls` path count or raw `package.json` count for budget enforcement.

## Installed binary checks

```text
acryl --version: 0.1.17
acryl tui --json: {"mode":"direct","profile":"acryl",...}
```
