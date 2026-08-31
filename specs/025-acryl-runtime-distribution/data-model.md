# Terminal Distribution Evidence Model

The governing scope is [`spec.md`](./spec.md).

```ts
type NpmInstallEvidence = {
  tarballPath: string
  tarballBytes: number
  platform: string
  nodeVersion: string
  npmVersion: string
  installCommand: string
  installWallTimeMs: number
  directDependencyCount: number
  canonicalInstalledPackageCount: number
  installedFileCount: number
  installedBytes: number
  installedAcrylRoot: string
  versionCheck: { exitCode: number; stdout: string }
  tuiJsonCheck: { exitCode: number; stdout: string }
}
```

`canonicalInstalledPackageCount` counts distinct realpath-deduplicated package roots beneath `installedAcrylRoot/node_modules`, excluding `.bin` and pnpm metadata.

## Deliberate deferrals

`RuntimeCapability`, `RuntimeEndpoint`, remote client contracts, permissions, provenance, and client-contribution models are deliberately deferred. This feature introduces no public runtime contract and therefore exposes no Cordis `Context`.
