# Plan: Effect bridge and Unplugin

```text
packages/effect/src
  bindings.ts   effectService(token), Binding, IdentifierOf, TokensOf
  runtime.ts    createEffectRuntime, runEffect
  layer.ts      layerPlugin
packages/unplugin/src
  index.ts      aimbrace unplugin factory, exports per bundler, virtual module ids, graph loading
```

Effect 4 notes (read from the pinned source): services are `Context.Service<Identifier, Shape>(key)`; `Layer.succeedContext`, `Layer.provide`; `ManagedRuntime.make(layer)` with `.context()`, `.runPromise(effect, { signal })`, `.dispose()`.

Unplugin notes: `createUnplugin(factory)` returns one getter per bundler; hooks used: `buildStart`, `resolveId`, `load`, `watchChange`.
