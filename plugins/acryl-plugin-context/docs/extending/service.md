# Services: provide a capability, consume it

Examples: `../example-plugins/packages/service-provider-greeter/`, `service-consumer-greeter/`.

- **Provide**: `class X extends Service { constructor(ctx) { super(ctx, 'name') } }` and export it
  as `apply` (`export { X as apply }`). Import `Service` from `@deepseek-ai/cordis`.
- **Require (hard)**: `export const inject = ['name']`. The fiber is `PENDING` until something
  provides `name`, then goes `ACTIVE` by itself, whatever the mount order. `PENDING` is healthy.
- **Optional**: `ctx.get('name')` and handle `undefined`; never `PENDING`.
- Depend on the service **name**, never on a concrete provider. To swap an implementation, mount
  another provider of the same name (three-role design: definition, provider, consumer).
- A `Service` instance's `this.ctx` is its construction scope, not the caller's: do not read
  `this.ctx.loader` or `this.ctx.fiber` inside its methods.
