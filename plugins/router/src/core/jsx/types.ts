/**
 * All types exported from "acryl-router/jsx" are in this file.
 */
import type { Child, JSXNode } from './base.ts'
import type { JSX } from './intrinsic-elements.ts'
import type { DomEvent } from '../utils/types.ts'

export type { Child, JSXNode, FC } from './base.ts'
export type { RefObject } from './hooks/index.ts'
export type { Context } from './context.ts'

export type PropsWithChildren<P = unknown> = P & { children?: Child | undefined }
export type CSSProperties = JSX.CSSProperties

/**
 * React types
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReactElement<P = any, T = string | Function> = JSXNode & {
  type: T
  props: P
  key: string | null
}
type ReactNode = ReactElement | string | number | boolean | null | undefined
type ComponentClass<_P = {}, _S = {}> = unknown

export type { ReactElement, ReactNode, ComponentClass }

export type Event = globalThis.Event
export type MouseEvent = DomEvent<'MouseEvent'>
export type KeyboardEvent = DomEvent<'KeyboardEvent'>
export type FocusEvent = DomEvent<'FocusEvent'>
export type ClipboardEvent = DomEvent<'ClipboardEvent'>
export type InputEvent = DomEvent<'InputEvent'>
export type PointerEvent = DomEvent<'PointerEvent'>
export type TouchEvent = DomEvent<'TouchEvent'>
export type WheelEvent = DomEvent<'WheelEvent'>
export type AnimationEvent = DomEvent<'AnimationEvent'>
export type TransitionEvent = DomEvent<'TransitionEvent'>
export type DragEvent = DomEvent<'DragEvent'>
