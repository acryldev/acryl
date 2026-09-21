---
name: acryl-restyle-ui
description: Use when the user asks to change colors, fonts, theme, dark mode, logo, branding, name, favicon, tab title or the general look and feel of the Web or Desktop app.
---
# Restyle or rebrand the Web or Desktop UI

Read {{pack}}/docs/extending/ui-customization.md first (what each surface allows and what is live), then
{{pack}}/docs/extending/ui-theme.md and {{pack}}/docs/extending/ui-branding.md, and the token names in
{{pack}}/docs/maps/theme-tokens.md. Components you add should use the shared library ({{pack}}/docs/extending/ui-components.md). Copy {{pack}}/example-plugins/packages/client-theme-override/ (and web-page-branding for the favicon and page
CSS) into <workspace>/.acryl-extensions/<name>/. Override tokens with BOTH light and dark values; keep contrast readable; never edit
node_modules or the app. The tab title is rewritten by the app at runtime: use the observer from the example. Verify, install with
acryl_install_plugin, and ask the user to reload the page or window and check light and dark. You cannot see the screen: say what you
changed and what you could not verify. Say plainly that upstream text (for example the testing notice) and, on Desktop, the app icon and
window chrome cannot be changed by a plugin.
