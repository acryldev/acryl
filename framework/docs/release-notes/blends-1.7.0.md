# @acryldev/blends 1.7.0

The framework CLI now publishes in the scope as `@acryldev/blends`; its command is still `acrylblends`. The short package name `acrylblends` stays as a
thin alias of the same version, so `npx acrylblends my-app` keeps working.

- Imports move from `acrylblends/<subpath>` to `@acryldev/blends/<subpath>`, and an app's dependency is `"@acryldev/blends": "^1.7.0"`.
- Every package in this repository is `@acryldev/*` (frames, plugins, runtime, examples); apps made by older releases are not carried forward (day 0).
- `acrylblends upgrade` no longer migrates plugin copies made under the old folder names.
