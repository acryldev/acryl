# Plugin configuration

Example: `../examples/packages/config-schema-basic/`. Export a Schemastery `Config`
(`import Schema from '@deepseek-ai/schemastery'`, add it as a dependency). The Loader validates
config and fills defaults **before** `apply` runs, so a bad config fails the whole mount and
nothing is half-applied. Do not export a plain object. Config is replaced, not deep-merged.
A row's config lives in its Loader row; mount with a config, and a schema error names the field.
