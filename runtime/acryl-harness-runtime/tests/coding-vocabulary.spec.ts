import { describe, expect, it } from 'vitest'
import { CODING_CAPABILITY_COMPOSITIONS } from '@acryldev/coding-capabilities'
import { ACRYL_CODING_CAPABILITIES } from '../src/coding-capabilities.ts'

/**
 * The two halves of a capability live apart on purpose (spec 051 T021): the runtime keeps the Blueprint vocabulary (which ids exist, and
 * which need the framework router), the surface composition package keeps the rows and packages. They must name the same ids, both ways.
 */
describe('the Blueprint vocabulary and the surface composition', () => {
  it('name exactly the same capability ids', () => {
    expect(CODING_CAPABILITY_COMPOSITIONS.map(capability => capability.id).sort()).toEqual(
      ACRYL_CODING_CAPABILITIES.map(capability => capability.id).sort(),
    )
  })
})
