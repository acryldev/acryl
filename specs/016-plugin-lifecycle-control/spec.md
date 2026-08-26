# Feature Specification: Plugin Lifecycle Control

**Status:** In progress
**Scope:** ACR Desktop plugin status, lifecycle actions, and reload shortcut

## Objective

Give users one Settings surface that distinguishes the Host and Client faces of every current Loader plugin and safely controls lifecycle-managed, user-mutable plugins.

The first managed dual-face plugin is Development Canvas. The interface and policy must support additional ACR and profile-installed plugins without moving lifecycle logic into those plugins.

## User requirements

1. Settings -> Plugins exposes every current Host Loader entry.
2. Every row reports:
   - Loader configuration: enabled or disabled;
   - Host root Fiber phase;
   - whether the package declares a Client face;
   - Client root Fiber phase in the current renderer;
   - whether the row is mutable or protected, with a reason.
3. A mutable disabled row offers **Enable**.
4. A mutable enabled row offers **Disable** and **Reload**.
5. Disable disposes the Host Fiber and its effects, persists the change, and reloads the renderer so the Client Fiber and presentation contribution disappear.
6. Enable persists the change, mounts and awaits the Host Fiber, and reloads the renderer so the Client package enters the new boot graph.
7. Reload restarts the Host Fiber with current configuration and reloads the renderer for a fresh Client Fiber.
8. The Canvas fallback conversation becomes visible after Canvas is disabled and Canvas returns after it is enabled.
9. `/reload` is a human command, not model input. With no argument it reloads all mutable ACR plugin entries. With one Loader entry id it reloads that mutable entry.
10. Failed operations remain visible and actionable. They must not silently leave persistence and runtime state divergent.

## Safety constraints

- Pinned `deepseek-harness/` remains unmodified.
- The lifecycle controller is external to every controlled plugin.
- The controller, Loader, Include root, Web server, Client module system, connection, renderer, Settings shell, and other control-plane dependencies are protected.
- Dynamically generated child rows and nested preset rows are visible but protected until they have a stable persistence identity and a proved recovery path.
- A protected row never renders an active lifecycle button.
- The first implementation may manage only explicit stable entry ids. “Visible” and “mutable” are separate properties.
- All Host mutations use Cordis Loader/Fiber operations. No feature is disabled by hiding React output.
- Client graph membership changes are applied by a renderer reload because the pinned Client module table does not support complete live graph add/remove reconciliation.
- Mutating HTTP requests require the exact loopback origin and bounded, strictly validated JSON.

## Acceptance scenarios

### Canvas disable

1. Open Settings -> Plugins -> Lifecycle.
2. Development Canvas reads Host `active`, Client `active`, configuration `enabled`.
3. Select Disable and confirm.
4. Host Canvas Fiber reaches disposed/no-Fiber and PTY/routes are released.
5. Renderer reloads.
6. Canvas is absent from the Client Loader and `desktop.main`; conversation fallback renders.
7. Reopening Lifecycle reads Host `unmounted`, Client `not loaded`, configuration `disabled`.

### Canvas enable

1. Select Enable for disabled Development Canvas.
2. Host entry mounts and reaches active.
3. Renderer reloads from the new Web graph.
4. Canvas Client Fiber reaches active and Canvas replaces the fallback.

### Canvas reload

1. Select Reload or run `/reload include:desktop-development-canvas`.
2. Host Fiber disposes and reapplies once.
3. Renderer reloads and creates a fresh Client Fiber.
4. No duplicate routes, PTYs, styles, slots, or listeners remain.

### Protected kernel row

1. Expand Loader, Web server, connection, lifecycle controller, or another protected dependency.
2. Host and Client status remain visible.
3. The UI explains why the row is protected and offers no mutation action.

## Out of scope for this increment

- Editing the pinned upstream read-only Plugin Inventory tab.
- Hot-adding a Client graph row without renderer reload.
- Treating every internal DSH row as independently safe to disable.
- Hiding an enabled Client contribution while leaving its Fiber mounted.
- Using terminal output as lifecycle authority.
