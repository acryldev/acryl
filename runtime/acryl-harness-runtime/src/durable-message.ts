/** Input accepted by the runtime-owned durable Harness session bridge. */
export interface DurableSessionMessage {
  readonly sessionId: string
  readonly text: string
}

/** Acknowledgement that a message was accepted for durable session processing. */
export interface DurableSessionMessageReceipt {
  readonly accepted: true
  readonly sessionId: string
  readonly messageId: string
}

/**
 * Host-to-runtime boundary for one identified durable Harness session.
 * Implementations belong to the runtime owner, never to a presentation surface.
 */
export interface DurableSessionMessagePort {
  dispatch(
    message: DurableSessionMessage,
    signal?: AbortSignal,
  ): Promise<DurableSessionMessageReceipt>
}
