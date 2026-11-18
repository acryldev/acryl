# acryl-web-service

The `acrylWeb` service: where the thing that serves the page listens, and nothing else. ACRYL's plugins inject it for the address the page is
served from (the loopback check, an origin handed to a child process), never a harness service, so the carrier behind it can change without
touching them. The carrier today is DSH's `webServer`; routes and upgrades go through the framework's router (`ctx.router`, `ctx.routerHttp`).
The service type is declared once, in `acryl-control` (`src/platform/web.ts`).

One package for both products (spec 051): ACRYL's engine mounts it on the Web and Desktop surfaces (`runtime/acryl-harness-runtime/src/engine-dsh.ts`),
and every Blends app mounts it as the frame row `acryl-web`, installed as `@acrylblends/web`. Its row id stays `acryl-web` so apps made before the
move keep their composition; the package name differs because `apps/acryl-web` (ACRYL's browser app) already owns that name.

Provided inside one effect: a replaced carrier re-binds the service and unloading the plugin removes it. `pnpm test` pins that contract.
