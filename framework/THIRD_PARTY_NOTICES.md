# Third-party notices

Code that is copied into this repository (vendored), with its license next to it. The framework sources moved from ACRYL keep their own notices in `plugins/*/LICENSE` and `provenance.json`.

| Component | Version | License | Where | Why |
| --- | --- | --- | --- | --- |
| [xterm.js](https://github.com/xtermjs/xterm.js) (`@xterm/xterm`) | 6.0.0 | MIT | `plugins/driver-pty/client/vendor/xterm.mjs`, `xterm-css.mjs` (the package's `css/xterm.css` as a string), license in `LICENSE` | the terminal tab of the agent panel |
| `@xterm/addon-fit` | 0.11.0 | MIT | `plugins/driver-pty/client/vendor/addon-fit.mjs`, license in `LICENSE-addon-fit` | sizes the terminal to its box |
| [Agent Client Protocol](https://agentclientprotocol.com) v1 JSON schema (`@agentclientprotocol/sdk`, `schema/v1/schema.json`) | 2.0.2 | Apache-2.0 | `plugins/driver-acp/test/acp-v1/schema.json`, license in `LICENSE` | a test fixture: `driver-acp`'s conformance test checks every message against it; not shipped or copied into apps |
| [cordis-plugin-graph](https://github.com/cordisplugins/cordis-plugin-graph) | e9bf6b5 | MIT (the owner's own) | ported into `ide/acryl-blends-frame/src/graph-inspect.ts` and `src/client/graph-canvas.ts`, noted in that package's `provenance.json` | the plugin graph in Settings > Plugins |
| [Cytoscape.js](https://js.cytoscape.org) | 3.34.3 | MIT | a dependency of `ide/acryl-blends-frame`, bundled into its `lib/client.js` | draws the plugin graph |

The files are unmodified copies from the npm tarballs. `plugins/driver-pty/client/vendor/VERSION` records the exact versions and how to update them.

A desktop product built by `scripts/pack-blank-mac.mjs` carries [Git](https://git-scm.com) 2.56.0 (GPL-2.0), the build GitHub Desktop ships ([desktop/dugite-native](https://github.com/desktop/dugite-native) v2.56.0-2), without Git Credential Manager and `scalar`. It is not in this repository: the packer downloads it, checks it against a pinned SHA-256, and puts it in the app's `Resources/git` with Git's licence (`COPYING.txt`) and the offer of its source (`SOURCE.txt`); Settings > App opens both, and the macOS About panel names them. It runs as a separate program, never linked.

`node-pty` (MIT, Microsoft) is not vendored: `driver-pty` lists it as a dependency and an app that adds the plugin installs it.
