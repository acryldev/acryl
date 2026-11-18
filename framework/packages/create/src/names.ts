/**
 * The one place this package names the framework. The templates are written with `__PACKAGE__` and `__RANGE__` (the range is stamped at create time from the framework version this package carries, see `frameworkRange`), and the text of `AGENTS.md` with
 * `__PACKAGE__`, so a rename (for example to `acryl`) is a change here and in `scripts/lib/names.mjs`, which a test keeps equal.
 */
export const PACKAGE = 'acrylblends'
export const CLASS = 'Acryl'
export const CREATE = 'create-acrylblends'

/** The file that makes a folder a template other people can create apps from (`${CREATE} <name> github:owner/repo`). */
export const TEMPLATE_MANIFEST = 'acryl.template.json'
