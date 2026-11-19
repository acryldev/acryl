# Archived specs

Superseded. Kept for history only; nothing here describes the current product.

- `original-brief.md` - the first brief: a composition runtime built on Cordis plus Hookable, Effect, Unplugin, Hono and
  Fastify.
- `000-roadmap-v1`, `001` to `009` - that runtime (`@aimbrace/core` and its packages), built and then removed.
- `010-scaffolder-rebuild` - the first scaffolder, with Hono and Fastify templates.

Why they were superseded: Cordis already provides plugins, services, `inject`, lifecycle, effects, events and
isolation. The runtime re-implemented them, and the extra libraries duplicated them. See
[`../000-roadmap/research.md`](../000-roadmap/research.md) (R1) and [`../011-cordis-only/spec.md`](../011-cordis-only/spec.md).
The code is in git history before the commit that removed it.
