// @webboxes/plugin-hub: saving, sharing and pulling Cordis plugins, host-independent (spec 044 lifecycle.md, "Built to be extracted into
// ACRYL Blends", layer 1). The Cordis service that offers these to an app, and its faces, live in the app; this package has no Cordis, DSH or
// surface dependency, so the engine, a catalog's CI and other runtimes can use it.
export { InvalidPluginNameError, parsePluginName, pluginNameOf, storeDirectoryOf, type PluginName } from './name.js'
export { bumpVersion, compareVersions, newestVersion, parseVersion, type Version, type VersionBump } from './version.js'
export { formatPluginSource, InvalidPluginSourceError, parsePluginSource, type PluginSource } from './source.js'
export { integrityOf, readTarball, writeTarball, type TarballFile } from './tarball.js'
export { bundleProblem, manifestOfTarball, packageFiles, packFolder, PackError, type PackedPlugin } from './pack.js'
export { PluginStore, StoreConflictError, storeRootOf, type StoredVersion, type StoreRecord } from './store.js'
export { savePlugin, type SavedPlugin } from './save.js'
export { pullPlugin, PullError, type PulledPlugin, type PullOptions, type PullPorts, type RegistryPort, type ReleaseInfo, type ReleasePort } from './pull.js'
export { githubReleasesOverHttps, httpsDownload, npmRegistryOverHttps, type Fetch } from './http.js'
export { createPluginHub, findSourceFolder, missingHostServices, type HubPorts, type InstalledPlugin, type InstallerPort, type InstallOutcome, type PluginHub, type PullResult, type PullStatus, type SaveResult, type UpdateResult } from './hub.js'
export { checkContractShape, clientInjectFromSource, hostEntryOf, hostInjectFromSource, providedServices, readServiceContract, slotsInSource, syncServiceContract, type ServiceContract, type Side, type SideLists } from './contract.js'
export { PLUGIN_LABELS, sharePlugin, type PublishGitPort, type RepositoryHostPort, type ShareOptions, type ShareResult, type Visibility } from './share.js'
export { firstReleasePort, gitCli, githubCli, githubReleasesViaGh, ToolError } from './github-cli.js'
export { NPM_REGISTRY, publishToNpm, type NpmPublishOptions, type NpmPublishPort, type NpmPublishResult } from './npm-publish.js'
export { firstRegistryPort, npmCli, npmRegistryViaCli } from './npm-cli.js'
