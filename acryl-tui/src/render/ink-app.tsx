import { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export interface AcrylInkAppProps {
  readonly profile: string
  readonly ownerMode: 'owner' | 'attached'
  readonly runtimeState: 'ready' | 'starting' | 'unavailable'
}

/** Minimal Ink projection of the selected ACRYL runtime. */
export function AcrylInkApp({ profile, ownerMode, runtimeState }: AcrylInkAppProps) {
  const [message, setMessage] = useState('')
  const [dispatchPending, setDispatchPending] = useState<string | undefined>()

  useInput((input, key) => {
    if (key.return) {
      if (message.trim() === '') return
      setDispatchPending(message)
      setMessage('')
      return
    }
    if (key.backspace || key.delete) {
      setMessage(current => current.slice(0, -1))
      return
    }
    if (input >= ' ') setMessage(current => current + input)
  })

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">ACRYL</Text>
      <Text>Profile: {profile}</Text>
      <Text>Runtime: {runtimeState} ({ownerMode})</Text>
      <Text>Message: {message}</Text>
      {dispatchPending === undefined ? undefined : <Text>Dispatch pending: {dispatchPending}</Text>}
    </Box>
  )
}
