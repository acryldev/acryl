# Events: listen, emit, intercept

Example: `../example-plugins/packages/event-hook-basic/`.

`ctx.on(name, fn)` listens and Cordis removes it when the plugin unloads; `ctx.emit(name, ...args)`
broadcasts synchronously. Dispatch modes: `emit` (fire and forget), `parallel` (await all),
`serial` (in order until a value bails), `bail` (sync serial), `waterfall` (around-middleware:
`ctx.on(name, async (input, next) => ...)`). **A waterfall listener that only observes MUST call
`next()`**, otherwise it swallows the downstream default. Use services for calls and events for
observation or interception. Facts that must survive a restart belong in durable session state,
not in a Cordis event.

Every lifecycle event (prompt construction, the provider request, streaming, session events) is listed in `../maps/events.md`. Working example of a
waterfall hook on prompt construction: `../example-plugins/packages/prompt-assemble-hook/`.
