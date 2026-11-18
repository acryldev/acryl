# Plan: Config and loader

## Source layout (packages/loader/src)

```text
errors.ts     LoaderError
config.ts     AimbraceConfig, ConfigEntry, defineConfig, normaliseConfig
resolve.ts    resolvePlugin(specifier, baseDir, config?) -> PluginLike
load.ts       loadConfig, loadManifest, findConfig, createAppFromConfig
discover.ts   discoverPlugins
index.ts
```

## Notes

- Dynamic `import()` of file URLs. Bare specifiers resolve with `createRequire(base).resolve` first, falling back to `import.meta.resolve` for ESM-only packages (`exports` with only `import`).
- Module export unwrapping: default export, else `plugin`, else the single export that is a plugin.
- Fixtures live inside the package so `@aimbrace/core` resolves like it would for a user.
