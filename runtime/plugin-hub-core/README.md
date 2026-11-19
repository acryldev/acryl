# @webboxes/plugin-hub

Saving, sharing and pulling Cordis plugins, with no Cordis, DSH or surface dependency (spec 044, `specs/044-extension-persistence-and-registries/lifecycle.md`).

- **Names** (`parsePluginName`, `pluginNameOf`): `@owner/accounting-app-aurora.sidebar.date-filter`; the dots are the levels of the author's tree.
- **Sources** (`parsePluginSource`): `store:`, `github:owner/repo[@version]`, `npm:`, a `.tgz` file or https URL, a folder, or a bare name. A raw git address is refused.
- **Tarballs** (`packFolder`, `writeTarball`, `readTarball`, `integrityOf`): npm's file rules and layout, written deterministically (the same files give the same sha512 on every system), with no npm needed.
- **Store** (`PluginStore`, `savePlugin`): every saved or pulled version as a tarball plus a record; a version is kept once.
- **Pull** (`pullPlugin`): resolve, fetch, check the sha512, read the manifest, store. Installing is the app's job.
