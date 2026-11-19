/**
 * @module
 * Types utility.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Expect<T extends true> = T
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
export type NotEqual<X, Y> = true extends Equal<X, Y> ? false : true

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

export type RemoveBlankRecord<T> =
  T extends Record<infer K, unknown> ? (K extends string ? T : never) : never

export type IfAnyThenEmptyObject<T> = 0 extends 1 & T ? {} : T

export type JSONPrimitive = string | boolean | number | null
export type JSONArray = (JSONPrimitive | JSONObject | JSONArray)[]
export type JSONObject = {
  [key: string]: JSONPrimitive | JSONArray | JSONObject | object | InvalidJSONValue
}
export type InvalidJSONValue = undefined | symbol | ((...args: unknown[]) => unknown)

type InvalidToNull<T> = T extends InvalidJSONValue ? null : T

type IsInvalid<T> = T extends InvalidJSONValue ? true : false

/**
 * symbol keys are omitted through `JSON.stringify`
 */
type OmitSymbolKeys<T> = { [K in keyof T as K extends symbol ? never : K]: T[K] }

export type JSONValue = JSONObject | JSONArray | JSONPrimitive
/**
 * Convert a type to a JSON-compatible type.
 *
 * Non-JSON values such as `Date` implement `.toJSON()`,
 * so they can be transformed to a value assignable to `JSONObject`
 *
 * `JSON.stringify()` throws a `TypeError` when it encounters a `bigint` value,
 * unless a custom `replacer` function or `.toJSON()` method is provided.
 *
 * This behavior can be controlled by the `TError` generic type parameter,
 * which defaults to `bigint | ReadonlyArray<bigint>`.
 * You can set it to `never` to disable this check.
 */
export type JSONParsed<T, TError = bigint | ReadonlyArray<bigint>> = T extends {
  toJSON(): infer J
}
  ? (() => J) extends () => JSONPrimitive
    ? J
    : (() => J) extends () => { toJSON(): unknown }
      ? {}
      : JSONParsed<J, TError>
  : T extends JSONPrimitive
    ? T
    : T extends InvalidJSONValue
      ? never
      : T extends ReadonlyArray<unknown>
        ? { [K in keyof T]: JSONParsed<InvalidToNull<T[K]>, TError> } extends infer A
          ? A extends ReadonlyArray<unknown>
            ? A // plain array or tuple; the mapped type preserves array-ness
            : JSONParsed<InvalidToNull<T[number]>, TError>[] // array with extra properties; JSON.stringify drops them
          : never
        : T extends Set<unknown> | Map<unknown, unknown> | Record<string, never>
          ? {}
          : T extends object
            ? T[keyof T] extends TError
              ? never
              : {
                  [
                    K in keyof OmitSymbolKeys<T> as IsInvalid<T[K]> extends true ? never : K
                  ]: boolean extends IsInvalid<T[K]>
                    ? JSONParsed<T[K], TError> | undefined
                    : JSONParsed<T[K], TError>
                }
            : T extends unknown
              ? T extends TError
                ? never
                : JSONValue
              : never

/**
 * Useful to flatten the type output to improve type hints shown in editors. And also to transform an interface into a type to aide with assignability.
 * @copyright from sindresorhus/type-fest
 */
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {}

/**
 * A simple extension of Simplify that will deeply traverse array elements.
 */
export type SimplifyDeepArray<T> = T extends any[]
  ? { [E in keyof T]: SimplifyDeepArray<T[E]> }
  : Simplify<T>

export type InterfaceToType<T> = T extends Function ? T : { [K in keyof T]: InterfaceToType<T[K]> }

export type RequiredKeysOf<BaseType extends object> = Exclude<
  {
    [Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]> ? Key : never
  }[keyof BaseType],
  undefined
>

export type HasRequiredKeys<BaseType extends object> =
  RequiredKeysOf<BaseType> extends never ? false : true

export type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false

/**
 * String literal types with auto-completion
 * @see https://github.com/Microsoft/TypeScript/issues/29729
 */
export type StringLiteralUnion<T> = T | (string & Record<never, never>)

/** Bytes a Web Crypto call accepts; declared here so the public types do not need the DOM library. */
export type BufferSource = ArrayBufferView<ArrayBuffer> | ArrayBuffer

/** A Web Crypto key, named from the runtime's own `crypto` so the public types do not need the DOM library. */
export type CryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>

/** What the Web `Headers` constructor accepts, named from the runtime's own `Headers` so the public types do not need the DOM library. */
export type HeadersInit = NonNullable<ConstructorParameters<typeof Headers>[0]>

/** How a WebSocket hands binary data to `onmessage`; declared here so the public types do not need the DOM library. */
export type BinaryType = 'arraybuffer' | 'blob'

/** The members of a WebSocket `message` event the helpers hand out (the Web `MessageEvent`, whose Node global is not generic); declared here so the public types do not need the DOM library. */
export interface MessageEvent<T = unknown> extends Event {
  readonly data: T
  readonly lastEventId: string
  readonly origin: string
}

/** The members of a WebSocket `close` event the helpers hand out (the Web `CloseEvent`, which Node has no global type for); declared here so the public types do not need the DOM library. */
export interface CloseEvent extends Event {
  readonly code: number
  readonly reason: string
  readonly wasClean: boolean
}

/** A JSON Web Key (RFC 7517), the same members as the Web Crypto dictionary; declared here so the public types do not need the DOM library. */
export interface JsonWebKey {
  alg?: string
  crv?: string
  d?: string
  dp?: string
  dq?: string
  e?: string
  ext?: boolean
  k?: string
  key_ops?: string[]
  kty?: string
  n?: string
  oth?: { d?: string; r?: string; t?: string }[]
  p?: string
  q?: string
  qi?: string
  use?: string
  x?: string
  y?: string
}

/**
 * A DOM event type by its global name: the DOM library's own type when it is loaded (a browser project), otherwise the runtime's `Event`,
 * so the JSX types (event handler props) do not need the DOM library on a server.
 */
export type DomEvent<Name extends string> = typeof globalThis extends { readonly [K in Name]: { readonly prototype: infer E } } ? E : Event
