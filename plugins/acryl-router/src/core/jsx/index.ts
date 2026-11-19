/**
 * @module
 * JSX for Acryl.
 */

import { Fragment, cloneElement, isValidElement, jsx, memo, reactAPICompatVersion } from './base.ts'
import type { DOMAttributes } from './base.ts'
import { Children } from './children.ts'
import { ErrorBoundary } from './components.ts'
import { createContext, useContext } from './context.ts'
import { useActionState, useOptimistic } from './dom/hooks/index.ts'
import {
  createRef,
  forwardRef,
  startTransition,
  startViewTransition,
  use,
  useCallback,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  useViewTransition,
} from './hooks/index.ts'
import { Suspense } from './streaming.ts'

export {
  reactAPICompatVersion as version,
  jsx,
  memo,
  Fragment,
  Fragment as StrictMode,
  isValidElement,
  jsx as createElement,
  cloneElement,
  ErrorBoundary,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useReducer,
  useId,
  useDebugValue,
  use,
  startTransition,
  useTransition,
  useDeferredValue,
  startViewTransition,
  useViewTransition,
  useMemo,
  useLayoutEffect,
  useInsertionEffect,
  createRef,
  forwardRef,
  useImperativeHandle,
  useSyncExternalStore,
  useActionState,
  useOptimistic,
  Suspense,
  Children,
}

export type { DOMAttributes }

export default {
  version: reactAPICompatVersion,
  memo,
  Fragment,
  StrictMode: Fragment,
  isValidElement,
  createElement: jsx,
  cloneElement,
  ErrorBoundary,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useReducer,
  useId,
  useDebugValue,
  use,
  startTransition,
  useTransition,
  useDeferredValue,
  startViewTransition,
  useViewTransition,
  useMemo,
  useLayoutEffect,
  useInsertionEffect,
  createRef,
  forwardRef,
  useImperativeHandle,
  useSyncExternalStore,
  useActionState,
  useOptimistic,
  Suspense,
  Children,
}

export type * from './types.ts'

export type { JSX } from './intrinsic-elements.ts'
