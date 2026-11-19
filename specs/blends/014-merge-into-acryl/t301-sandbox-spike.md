# T301: does the sandbox work when the "node" is Electron run as Node?

Date 2026-10-10. Machine: macOS arm64. Binary: the installed `/Applications/ACRYL.app/Contents/MacOS/ACRYL` (Electron 43.0.0, Node 24.17.0,
V8 15.0). Method: the aimbrace sandbox runner started as that binary's child with `ELECTRON_RUN_AS_NODE=1` and
`--permission --allow-fs-read=<runner> --allow-fs-read=<tool folder> --disallow-code-generation-from-strings --max-old-space-size=128`;
the same probes against system Node 24.19 for comparison. Probe script: `probes/electron-sandbox-spike.mjs`.

| Probe | Electron as Node | System Node |
|---|---|---|
| `--permission` accepted, `process.permission` present | yes | yes |
| a TypeScript tool (`index.ts`, type stripping) runs | yes | yes |
| read a file outside the tool folder | denied (`ERR_ACCESS_DENIED`) | denied |
| start a child process | denied (`ERR_ACCESS_DENIED`) | denied |
| time limit on an infinite loop | killed by the parent | killed |
| environment inside | only what the parent passes (`ELECTRON_RUN_AS_NODE`, plus one macOS system variable) | same |

**Result on macOS: the permission model works the same under Electron as under Node.** No separate mechanism is needed here.

## A hazard found by reading the code (not run, on purpose)

The prototype's sandbox starts its child with `env: {}`. If `process.execPath` is the Electron binary, an empty environment has no
`ELECTRON_RUN_AS_NODE`, so the child would be a second full ACRYL app, not a Node process. ACRYL already hit this with the Harness subprocess
runner (development log, 2026-10-09). The ACRYL port must set `ELECTRON_RUN_AS_NODE=1` explicitly whenever `process.versions.electron` is set,
and a test must prove the child is Node (for example by asking it for `process.versions.electron` and `process.type`).

## Not yet checked

- **Windows and Linux.** The Node version is the same, so the permission semantics should be too; what can differ is path handling (the
  prototype resolves real paths because macOS `/var` is `/private/var`; Windows short names such as `RUNNER~1` and drive-letter case are the
  same kind of trap) and how the packaged binary is found. These need the packaged builds on those systems. ACRYL's release workflow already
  runs a packaged-app check on all three; the sandbox probes belong there once the plugin exists (T302).
- **The network is not restricted** by Node 24's permission model, in Electron or out of it.
