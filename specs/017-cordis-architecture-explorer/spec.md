# Cordis Architecture Explorer

## Objective

Make ACR's Cordis 4.0 architecture directly visible to users and demonstrate that product components are live plugins whose Fibers, dependencies, services, and effects can be inspected and safely controlled.

## Source of truth

The explorer must project native Cordis state only:

- `Context.registry` and runtime Fibers
- Fiber UID, parent, lifecycle state, and Loader ownership
- Fiber `inject` declarations and resolved providers
- `Context.reflect.store` service registrations and owning Fibers
- `Fiber.getEffects()` ownership labels
- Loader entry configuration for lifecycle mutation

The explorer must not introduce a parallel plugin descriptor, lifecycle registry, cached dependency graph, or custom mount state.

## User experience

Settings > Plugins provides separate tabs:

1. **Architecture** - read-only Host and Client Cordis contexts, shown independently.
2. **Lifecycle** - Loader-oriented enable, disable, and restart controls with protected policy.
3. **Plugin list** - upstream raw inventory.

The Architecture tab shows:

- Fiber and service counts per plane
- one row per live Fiber instance, including repeated mounts
- lifecycle phase and parent Fiber
- Loader entry and package when native ownership exists
- injected services and their resolution state
- services provided by the Fiber
- current labeled effect ownership tree

## Lifecycle demonstration

Development Canvas remains the first explicitly mutable dual-face plugin:

- Disable persists desired state and unmounts its Host Fiber.
- Renderer reload converges the Client context and removes its Fiber and effects.
- Enable recreates both planes.
- Reload uses native `Fiber.restart()` and then reconciles the Client context.

Protected control-plane rows remain inspectable but cannot be mutated.

## Security and limits

- Host inspection is exposed only through the authenticated same-origin loopback boundary.
- Responses never include service values, plugin configuration, callbacks, private errors, or filesystem paths.
- Fiber, service, effect, depth, and string counts are bounded.
- Host and Client Fibers are never merged by display name.

## Acceptance criteria

- Architecture tab displays live Host and Client contexts.
- Fiber UIDs, parents, phases, injects, provided services, and effect labels match native Cordis state.
- Repeated mounts remain distinct.
- Missing injects are visible.
- Existing Canvas lifecycle controls continue to work.
- Build, typecheck, strict boundary tests, and the full Desktop test suite pass.
