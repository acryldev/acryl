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
export function whereProblem(folder: string): string | undefined
export function readModelKey(home: string, provider?: string): string | undefined
export const maskKey: (key: string) => string
export function modelEnv(home: string, env?: Record<string, string | undefined>): Record<string, string | undefined>
export function appNameProblem(name: string, context: { exists(path: string): boolean }, answers?: { where?: string }): string | undefined
export function saveModelKey(home: string, key: string, provider?: string): void
