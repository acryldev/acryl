# Philosophy

## Motivation

A web application should not be written twice because it runs in two places. Acryl builds on the Web Standard APIs (`Request`, `Response`, `fetch`, `URL`, streams), so a
handler written once runs on Node.js (and experimentally Bun), in a test with no socket, and inside a Cordis app.

Three ideas follow from that:

- **The handler is a function over Web Standards.** There is no runtime object to import, so there is nothing to replace when the runtime changes. See
  [Web Standards](web-standard.md).
- **A plugin owns what it mounts.** Inside a Cordis app an application is mounted by a plugin and disappears when that plugin unloads, which is what lets an agent add,
  update and remove features while the app runs. See [Plugin lifecycle](../cordis/plugin-lifecycle.md).
- **The documentation travels with the app.** A generated app contains these pages, so a person or a coding agent working in the folder reads the API from the folder.
