---
name: acryl-add-ui
description: Use when an ACRYL extension needs UI in the Web or Desktop app (a button, panel, sidebar tab, settings section, dashboard).
---
# Add UI to ACRYL (web and desktop)

First read {{pack}}/docs/maps/mount-points.md to choose the mount point and check the surface: Web and Desktop use client
slots (header actions, sidebar tab, settings, composer, tool and message renderers, and on Desktop the `desktop.main` frame); the
CLI has only terminal overlays (`tuiCommands`, see {{pack}}/docs/extending/tui-command.md), so a UI request from a terminal user
means an overlay, not a slot. Then read {{pack}}/docs/extending/ui-components.md (build from the app's own Button, Modal, Input, Switch, Tag via require, not hand styles) and {{pack}}/docs/extending/client-slot.md completely, then the example
{{pack}}/example-plugins/packages/client-slot-header-action/ (index.js and client.js).

Key facts: the package has a host half (empty apply) and a browser half client.js exported as "./client" with
"dsh.client" in package.json. There is no build step: write client.js by hand inside the
window.__ModuleLoader__.load wrapper, use React.createElement (no JSX, no import), and pick a slot from the
table in the doc. Persist state in localStorage or behind a host route. Deliver with acryl_install_plugin and
tell the user to reload the page or window.
