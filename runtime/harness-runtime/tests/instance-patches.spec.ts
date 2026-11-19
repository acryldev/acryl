import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'
import { instancePatches } from '../src/engine-dsh.ts'
import { defaultInstance, pinnedInstance } from '../src/instance/index.ts'

describe('the patches an app instance contributes', () => {
  it('adds nothing for the default instance, whose first workspace stays in the OS Documents folder', () => {
    expect(instancePatches(defaultInstance('/home/someone'))).toEqual([])
    expect(instancePatches(undefined)).toEqual([])
  })

  it('points the chat workspace of any other instance at its own documents folder', () => {
    const instance = pinnedInstance('/tmp/acryl-run')
    expect(instancePatches(instance)).toEqual([{ id: 'workspace-controller', config: { documentsDirectory: join('/tmp/acryl-run', 'documents') } }])
  })

  it('merges into the workspace controller row where the surface composes one, and is ignored where it does not', () => {
    const patches = [...instancePatches(pinnedInstance('/tmp/acryl-run'))]
    const withController = composeEntries([[{ insert: [{ id: 'workspace-controller', name: '@deepseek-ai/dsh-api-workspace-controller' }] }], patches])
    expect(withController).toEqual([{ id: 'workspace-controller', name: '@deepseek-ai/dsh-api-workspace-controller', config: { documentsDirectory: join('/tmp/acryl-run', 'documents') } }])
    const without = composeEntries([[{ insert: [{ id: 'other', name: 'other-package' }] }], patches])
    expect(without).toEqual([{ id: 'other', name: 'other-package' }])
  })
})
