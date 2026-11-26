// Types for the plain-JavaScript launcher plugin, for the packages that import it from TypeScript (the desktop face's Host half).
export type Surface = 'web' | 'desktop' | 'tui'
export interface AppEntry { readonly id: string, readonly path: string, readonly blend: string, readonly madeBy: 'person' | 'agent', readonly surface: Surface, readonly added: string }
export const APP_MARKER: string
export const SURFACES: readonly Surface[]
export const APP_NAME: RegExp
export interface Starter { readonly value: string, readonly label: string, readonly description: string }
export const STARTERS: readonly Starter[]
export function readApps(home: string): readonly AppEntry[]
export function addApp(home: string, app: { path: string, madeBy?: 'person' | 'agent', surface?: Surface }, options?: { now?: () => string }): { entry: AppEntry, added: boolean }
export function removeApp(home: string, id: string): boolean
export function inspectApp(entry: AppEntry): { readonly state: 'ready' | 'missing' }
export function blendOf(folder: string): string
/** The version of the Blend an app was made from (`metadata.version` of its blend.yaml), or '' when it records none. */
export function blendVersionOf(folder: string): string
export function whereProblem(folder: string): string | undefined
export const ORCAROUTER_REFERRAL_URL: string
export function readModelKey(home: string, provider?: string): string | undefined
export const maskKey: (key: string) => string
export function modelEnv(home: string, env?: Record<string, string | undefined>): Record<string, string | undefined>
export function appNameProblem(name: string, context: { exists(path: string): boolean }, answers?: { where?: string }): string | undefined
export function saveModelKey(home: string, key: string, provider?: string): void
export const GITHUB_FILE: string
export const GITHUB_CLIENT_ID: string
export function githubClientId(env?: Record<string, string | undefined>): string | undefined
export function readGithub(home: string): { readonly token: string, readonly login: string, readonly scopes?: readonly string[] } | undefined
export function saveGithub(home: string, token: string, login: string, scopes?: readonly string[]): void
export function clearGithub(home: string): boolean
export function githubEnv(home: string, env?: Record<string, string | undefined>): Record<string, string | undefined>
export interface GithubSignIn { readonly deviceCode: string, readonly userCode: string, readonly verificationUri: string, readonly interval: number, readonly expiresIn: number }
export function startGithubSignIn(clientId: string, fetchImpl?: typeof fetch): Promise<GithubSignIn>
export type GithubPoll = { readonly state: 'pending', readonly interval?: number } | { readonly state: 'connected', readonly login: string } | { readonly state: 'failed', readonly reason: string }
export function pollGithubSignIn(home: string, clientId: string, deviceCode: string, fetchImpl?: typeof fetch): Promise<GithubPoll>
export function setBlendVisibility(folder: string, visibility: 'private' | 'public'): void
export const TOOLS_FOLDER: string
export const NODE_MINIMUM: readonly [number, number]
export function nodeIsNewEnough(version: string | undefined): boolean
export function toolDirs(home: string, platform?: NodeJS.Platform): { readonly node: string, readonly gh: string }
export function toolsEnv(home: string, env: Readonly<Record<string, string | undefined>>, platform?: NodeJS.Platform): Record<string, string | undefined>
export function versionOf(program: string, env: Readonly<Record<string, string | undefined>>, platform?: NodeJS.Platform): string | undefined
export function listedSum(sums: string, file: string): string | undefined
export interface ToolOptions { readonly platform?: NodeJS.Platform, readonly arch?: string, readonly fetchImpl?: typeof fetch }
export function installNode(home: string, options?: ToolOptions): Promise<string>
export function installGh(home: string, options?: ToolOptions): Promise<string>
export function prepareTools(home: string, env: Readonly<Record<string, string | undefined>>, options?: ToolOptions): Promise<readonly ('node' | 'gh')[]>
export function githubOf(folder: string): string | undefined
/** What one app's launcher is, per OS, as data (spec 052 D4). */
export interface LauncherApp { readonly id: string, readonly name: string, readonly folder: string, /** The picture of the launcher; `<folder>/assets/icon.png` when not given. */ readonly icon?: string, /** Hand the name on to the app (ACRYLBLENDS_NAME): for the copies `acryl` keeps. */ readonly forwardName?: boolean, /** The id the OS knows the running app by (osAppIdOf); read from the app folder when not given. */ readonly osId?: string }
export interface LauncherRecord { readonly offered?: 'yes' | 'no', readonly apps: Readonly<Record<string, { readonly name: string, readonly folder: string, readonly files: readonly string[] }>> }
export const LAUNCHERS_FILE: string
export function isLauncherHome(home: string, platform?: string): boolean
export function blendNameOf(folder: string): string
export function desktopExecArg(arg: string): string
export function launcherApp(home: string, id: string, platform?: string): LauncherApp | undefined
export function launcherPlan(input: { platform: string, home: string, node: string, app: LauncherApp, icon?: string }): { readonly files: readonly { readonly path: string, readonly content: string, readonly mode?: number }[], readonly record: readonly string[], readonly icon: { readonly kind: 'icns' | 'ico' | 'png', readonly from: string, readonly to: string } | undefined, readonly lnk: { readonly path: string, readonly target: string, readonly args: string, readonly icon: string | undefined, readonly workingDir: string, readonly appUserModelId?: string } | undefined, readonly sign: string | undefined }
export interface LauncherExec { (command: string, args: readonly string[], env: Readonly<Record<string, string>>): { readonly status: number | null, readonly stderr?: string } }
export function addToApplications(input: { platform?: string, home: string, node: string, app: string | LauncherApp, sourceDir?: string, exec?: LauncherExec }): { readonly written: readonly string[], readonly problems: readonly string[] }
export function removeFromApplications(input: { platform?: string, home: string, id?: string, app?: { readonly id: string } }): boolean
export function refreshLaunchers(input: { platform?: string, home: string, node: string, sourceDir?: string, exec?: LauncherExec }): readonly string[]
export function readLaunchers(home: string, platform?: string): LauncherRecord
export function offeredLauncher(home: string, platform?: string): 'yes' | 'no' | undefined
export function recordOffer(home: string, answer: 'yes' | 'no', platform?: string): void
/** Installing an app on this computer against the shared Program (spec 052 Step 1, app-install.js). */
export const PROGRAM_DIR: string
export const INSTALL_CLI: string
export function programOf(folder: string): string | undefined
export function linkTree(from: string, to: string, skip?: (path: string) => boolean, base?: string): void
export function installApp(input: {
  folder: string, home: string, npm: (args: string[], cwd: string) => Promise<number>, npmArgs?: readonly string[], say?: (line: string) => void,
  platform?: string, node?: string, device?: (path: string) => number | bigint,
}): Promise<{ readonly code: number, readonly program: 'used' | 'made' | 'retired' | 'none' }>

/** Share with team (spec 052 T061, from @acryldev/app-persistence): `node TEAM_RELEASE_CLI` in an app's folder with GH_TOKEN set pushes a version tag and follows GitHub's Release run. */
export const TEAM_RELEASE_CLI: string
/** Every line the command says starts with this; `release: <url>` carries the release page, `failed: <reason>` why it stopped. */
export const TEAM_RELEASE_SAY: string
export const RELEASE_WORKFLOW_FILE: string
export function repositoryOf(remote: string): string | undefined
export function nextReleaseVersion(version: string, tags: ReadonlySet<string>): string
/** Whether the stored GitHub connection may push a workflow file (it was granted `workflow`), which Share with team needs. */
export function canPushWorkflows(connection: { readonly scopes?: readonly string[] } | undefined): boolean
