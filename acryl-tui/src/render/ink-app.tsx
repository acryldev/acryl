import { Box, Text } from 'ink'

export interface AcrylInkAppProps {
  readonly profile: string
  readonly ownerMode: 'owner' | 'attached'
  readonly runtimeState: 'ready' | 'starting' | 'unavailable'
}

/** Minimal Ink projection of the selected ACRYL runtime. */
export function AcrylInkApp({ profile, ownerMode, runtimeState }: AcrylInkAppProps) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">ACRYL</Text>
      <Text>Profile: {profile}</Text>
      <Text>Runtime: {runtimeState} ({ownerMode})</Text>
    </Box>
  )
}
