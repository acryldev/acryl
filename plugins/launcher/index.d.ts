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
export function readGithub(home: string): { readonly token: string, readonly login: string } | undefined
export function saveGithub(home: string, token: string, login: string): void
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
