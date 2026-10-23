# Best practices

1. One plugin per capability; its package name is its Loader row id.
2. Register in `apply`; acquire raw resources only inside `ctx.effect(fn, 'label')`.
3. Ask for HTTP, do not require it: `ctx.inject(['routerHttp'], ...)`.
4. Guard anything that changes state or exposes the machine with `loopbackOnly()`; pass `inProcess: 'allow'` only when the in-process caller is the host's own code.
5. Use `c.connection`, never headers, for the peer.
6. Bound bodies with `bodyLimit` and the `read*` helpers.
7. Streams use `streamSSE`; do not hand-roll a `ReadableStream` that outlives the plugin.
8. Keep the contract in labels, not prose; check it with `acryl-inspect`.
9. Never import the DeepSeek Harness from a framework package; add a small port instead.
