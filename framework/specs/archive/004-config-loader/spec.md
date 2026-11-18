# Feature Specification: Config and loader

**Milestone**: M4 | **Parent**: [000-roadmap](../000-roadmap/spec.md) | **Status**: In progress

## Summary

`@aimbrace/loader` turns files into apps: a typed `defineConfig`, a loader for `aimbrace.config.*`
modules and `aimbrace.json` manifests, resolution of plugin specifiers to real plugins, discovery of
installed plugin packages, and `createAppFromConfig`. The brief's separate `config` package is folded in
here: plugin config validation already lives in core (Standard Schema), so only file handling is new.

## User Scenarios & Testing

### User Story 1 - Describe an app in a module (P1)

`aimbrace.config.mjs` (or `.js`, `.ts` on Node 24) default-exports `defineConfig({ name, plugins })`.
`loadConfig(path)` returns the normalised config; `createAppFromConfig(config)` returns an `App`.

**Acceptance**: plugins and configured instances both work; relative paths resolve from the config file; a missing file names the candidates searched.

### User Story 2 - Describe an app in JSON (P1)

`aimbrace.json` lists plugin specifiers with optional config:

```json
{ "name": "demo", "plugins": ["./plugins/hello.mjs", { "use": "@scope/pkg", "config": { "port": 8080 } }] }
```

Specifiers resolve relative to the manifest (relative or absolute path) or as bare package names from
the manifest's directory. A module may default-export a plugin, a configured instance, a function
returning either (a factory called with the manifest `config`), or export `plugin`.

**Acceptance**: each resolution form; clear `LoaderError` (code, specifier, hint) for a module that exports nothing usable; a `config` given for a plugin that already carries config is an error.

### User Story 3 - Find config files (P2)

`findConfig(cwd)` searches `aimbrace.config.{ts,mjs,js,cjs}` then `aimbrace.json` walking up from `cwd` to the filesystem root and returns the first match.

### User Story 4 - Discover installed plugin packages (P2)

`discoverPlugins(cwd)` lists packages in `node_modules` (and the nearest `package.json` dependencies)
whose manifest has an `"aimbrace": { "plugin": "<entry>" }` field, so a CLI can show what is installed.

## Requirements

- **FR-401**: `defineConfig` is an identity function with types; it validates shape lazily (at load).
- **FR-402**: The loader MUST NOT import `cordis` or `hookable`; it depends on `@aimbrace/core` only.
- **FR-403**: Manifests MUST be validated: `plugins` an array; entries a string or `{ use, config? }`; unknown keys rejected with the key named.
- **FR-404**: Errors are `LoaderError` with `code`, `file`, `specifier?`.
- **FR-405**: TypeScript config files rely on Node's native type stripping (Node 24, or 22.18+ with the flag); the error for an unsupported runtime explains this.
