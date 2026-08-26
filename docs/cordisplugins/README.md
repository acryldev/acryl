# Cordis plugins in this checkout

This folder is the local authoring guide for plugins on the current DSH Desktop
+ Cordis setup. Read it before adding ACRYL capabilities.

## Start here

1. [Hello World plugin guide](./hello-world-plugin-guide.md) — the smallest
   installable Host plugin: `apply(ctx)`, bundle patch, profile install,
   `inject`, reversible effects, and failure diagnostics.
2. [Development Canvas plugin](./development-canvas-plugin.md) — a standalone
   Host/Client package, Desktop slot seam, and unload contract.
3. [Hello World (short)](./hello-world.md) — condensed companion.
4. [Constitution](../../.specify/memory/constitution.md) — ACRYL laws that every
   later plugin must obey.
5. [Desktop plugin services](../../dsh-plugin-desktop/docs/plugin-services.md)
   — the only public Desktop Host seams (`desktopProfiles`, `desktopPnpm`).

## Principle

A plugin is a lifecycle-managed Cordis module. A bundle ships a
`cordis.patch.yml`. A profile lists bundles. Electron is not a second plugin
system. If a resource is created for the plugin's lifetime, register its
disposer.

The first serious product plugin after Hello World is Development Canvas.
The standalone `dsh-plugin-development-canvas` package owns both Host and Client
faces. Its Client contributes through Desktop's `desktop.main` slot. Disabling
the row restores the default conversation and reverses every Canvas route,
PTY, style, and slot contribution. Spec: `specs/015-development-canvas/`.
