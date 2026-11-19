/**
 * @module
 * This module provides the `acryl-router/jsx/dom` dev runtime.
 */

import type { JSXNode, Props } from '../base.ts'
export type { JSX } from '../base.ts'
import * as intrinsicElementTags from './intrinsic-element/components.ts'

export const jsxDEV = (tag: string | Function, props: Props, key?: string): JSXNode => {
  if (typeof tag === 'string' && intrinsicElementTags[tag as keyof typeof intrinsicElementTags]) {
    tag = intrinsicElementTags[tag as keyof typeof intrinsicElementTags]
  }
  return {
    tag,
    type: tag,
    props,
    key,
    ref: props.ref,
  } as JSXNode
}

export const Fragment = (props: Record<string, unknown>): JSXNode => jsxDEV('', props, undefined)
