# acryl-web

The `acrylWeb` service of the IDE port: ACRYL's plugins inject it for the address the page is served from (the loopback check, an origin handed to a child process) and for nothing else. Here the carrier is DSH's `webServer`; routes and upgrades stay with the framework's router (`ctx.router`, `ctx.routerHttp`).

Provided inside one effect: a replaced carrier re-binds the service and unloading the plugin removes it. Ported from ACRYL (`runtime/acryl-harness-runtime/src/engine-web.ts`, `runtime/acryl-control/src/platform/web.ts`) for the IDE port, slice 1 ([plan](../../docs/plans/ide-port.md)); provenance in [`provenance.json`](provenance.json).
