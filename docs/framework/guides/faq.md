# FAQ

**Is Hono a dependency?** No. The design is rewritten as Cordis plugins; see [Hono parity](../hono-parity.md).

**Does the terminal UI need a server?** No. It calls `ctx.router.request(...)` in process.

**Where is the DeepSeek Harness in this?** It is the optional agent. Framework packages do not import it; the HTTP adapter reaches the existing `webServer` through a port.

**Can I use React?** Yes. React stays; `useCell` binds a component to a cell.

**Why can an in-process call be refused?** A guard like `loopbackOnly` checks the socket peer; with no socket it cannot verify the peer, so it refuses unless told `inProcess: 'allow'`.

**What is not built?** Page rendering and SSR (milestone M6, an owner decision), and the middleware listed as "not built" in [Hono parity](../hono-parity.md).

**A plugin I installed live says `cannot get property "router" without inject`.** The installer mounted it with `this.ctx` from inside a service method. Mount from the context captured in the constructor instead; see best practice 10.
