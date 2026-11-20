/**
 * @module
 * This module provides APIs for `acryl-router/jsx/dom`.
 */

import { isValidElement, reactAPICompatVersion, shallowEqual } from '../base.ts'
import type { Child, DOMAttributes, JSX, JSXNode, Props, FC, MemorableFC } from '../base.ts'
import { Children } from '../children.ts'
import { DOM_MEMO } from '../constants.ts'
import { useContext } from '../context.ts'
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
} from '../hooks/index.ts'
import { ErrorBoundary, Suspense } from './components.ts'
import { createContext } from './context.ts'
import { useActionState, useFormStatus, useOptimistic } from './hooks/index.ts'
import { Fragment, jsx } from './jsx-runtime.ts'
import { createPortal, flushSync } from './render.ts'

export { render } from './render.ts'

const createElement = (
  tag: string | ((props: Props) => JSXNode),
  props: Props | null,
  ...children: Child[]
): JSXNode => {
  const jsxProps: Props = props ? { ...props } : {}
  if (children.length) {
    jsxProps.children = children.length === 1 ? children[0] : children
  }

  let key = undefined
  if ('key' in jsxProps) {
    key = jsxProps.key
    delete jsxProps.key
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jsx(tag, jsxProps, key) as any
}

const cloneElement = <T extends JSXNode | JSX.Element>(
  element: T,
  props: Props,
  ...children: Child[]
): T => {
  return jsx(
    (element as JSXNode).tag,
    {
      ...(element as JSXNode).props,
      ...props,
      children: children.length ? children : (element as JSXNode).props.children,
    },
    (element as JSXNode).key
  ) as T
}

const memo = <T>(
  component: FC<T>,
  propsAreEqual: (prevProps: Readonly<T>, nextProps: Readonly<T>) => boolean = shallowEqual
): FC<T> => {
  const wrapper = ((props: T) => component(props)) as MemorableFC<T>
  wrapper[DOM_MEMO] = propsAreEqual
  return wrapper as FC<T>
}

export {
  reactAPICompatVersion as version,
  createElement as jsx,
  useState,
  useEffect,
  useRef,
  useCallback,
  use,
  startTransition,
  useTransition,
  useDeferredValue,
  startViewTransition,
  useViewTransition,
  useMemo,
  useLayoutEffect,
  useInsertionEffect,
  useReducer,
  useId,
  useDebugValue,
  createRef,
  forwardRef,
  useImperativeHandle,
  useSyncExternalStore,
  useFormStatus,
  useActionState,
  useOptimistic,
  Suspense,
  ErrorBoundary,
  createContext,
  useContext,
  memo,
  isValidElement,
  createElement,
  cloneElement,
  Children,
  Fragment,
  Fragment as StrictMode,
  flushSync,
  createPortal,
}

export type { DOMAttributes }

export default {
  version: reactAPICompatVersion,
  useState,
  useEffect,
  useRef,
  useCallback,
  use,
  startTransition,
  useTransition,
  useDeferredValue,
  startViewTransition,
  useViewTransition,
  useMemo,
  useLayoutEffect,
  useInsertionEffect,
  useReducer,
  useId,
  useDebugValue,
  createRef,
  forwardRef,
  useImperativeHandle,
  useSyncExternalStore,
  useFormStatus,
  useActionState,
  useOptimistic,
  Suspense,
  ErrorBoundary,
  createContext,
  useContext,
  memo,
  isValidElement,
  createElement,
  cloneElement,
  Children,
  Fragment,
  StrictMode: Fragment,
  flushSync,
  createPortal,
}

export type { Context } from '../context.ts'

export type * from '../types.ts'
