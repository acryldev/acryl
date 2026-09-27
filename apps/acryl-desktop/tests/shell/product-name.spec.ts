import { describe, expect, it } from 'vitest'
import { DEFAULT_PRODUCT_NAME, resolveProductName } from '../../src/shell/product-name.ts'

describe('resolveProductName', () => {
  it('is ACRYL unless the instance is branded', () => {
    expect(resolveProductName({})).toBe(DEFAULT_PRODUCT_NAME)
    expect(resolveProductName({ ACRYL_BRAND_NAME: '  ' })).toBe('ACRYL')
    expect(resolveProductName({ ACRYL_BRAND_NAME: ' Orbit ' })).toBe('Orbit')
  })

  it('takes the app\'s own name from its Blueprint or definition when no name is given', () => {
    expect(resolveProductName({ ACRYL_BLUEPRINT: 'acryl.blank' })).toBe('Blank')
    expect(resolveProductName({ ACRYL_BLUEPRINT: 'acryl.ide' })).toBe('ACRYL')
    expect(resolveProductName({ ACRYL_BLUEPRINT: '/does/not/exist.yaml' })).toBe('ACRYL')
  })

  it('never puts a control character or an over-long value in a window title or log header', () => {
    expect(resolveProductName({ ACRYL_BRAND_NAME: 'a\nb' })).toBe('ACRYL')
    expect(resolveProductName({ ACRYL_BRAND_NAME: 'x'.repeat(41) })).toBe('ACRYL')
  })
})
