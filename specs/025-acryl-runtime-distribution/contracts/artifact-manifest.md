# Artifact Manifest Contract

## Purpose

Every portable CLI and Desktop release artifact is inspected before upload. The manifest proves it contains required runtime files and no disallowed payload classes.

## Contract

```ts
export interface ArtifactManifest {
  readonly product: 'cli' | 'desktop'
  readonly platform: 'darwin' | 'linux' | 'win32'
  readonly arch: 'arm64' | 'x64'
  readonly requiredPaths: readonly string[]
  readonly allowedNativePackagePatterns: readonly string[]
  readonly forbiddenPathPatterns: readonly string[]
  readonly maximumBytes: number
}
```

## Required rules

- CLI archives include the target Node executable, `acryl` launcher, and terminal runtime entry.
- Desktop installers include the main application executable, app archive, and target-native runtime modules.
- Foreign OS/CPU native packages are forbidden.
- Release source maps, test fixtures, TypeScript declarations, and development documentation are forbidden unless explicitly required by a runtime file allowlist.
- Licenses and third-party notices remain available according to release policy.
- A failure prints the exact offending path and manifest rule.
