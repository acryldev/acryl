# Plan: Plugin model and dependency graph

## Source layout

```text
packages/core/src/
  standard-schema.ts   vendored StandardSchemaV1 interface (types only) + validate helper
  semver.ts            parse, compare, satisfies (small subset)
  core-hooks.ts        CoreHooks, HookExtensions, AppHooks, PluginInfo (types only)
  context.ts           BaseContext, Scope, PluginContext<R,O,P>, PluginHandle (types only)
  plugin.ts            definePlugin, Plugin, PluginInstance, PluginMeta, toGraphInput
  graph.ts             buildGraph, Graph, diagnostics, exporters
  errors.ts            + graph and plugin error classes
```

## Notes

- Graph algorithm: provider map (service -> plugin), required edges, SCC detection with an iterative Tarjan, optional edges added in registration order with a reachability check, then Kahn with a binary heap keyed by registration index.
- `GraphInput` mirrors `PluginMeta` but with service names (strings), so JSON round trips.
- Closest-name suggestions use Levenshtein distance with a small threshold.
- Exporters sanitize ids for Mermaid and DOT but keep the original label.
