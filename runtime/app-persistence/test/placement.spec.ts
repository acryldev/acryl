import { describe, expect, it } from 'vitest'
import { placementLabel, placementOf, placementProblem, readCategories, withPlacement } from '../src/placement.js'

const categories = readCategories({
  categories: [
    { slug: 'gaming', name: 'Gaming', subs: [{ slug: 'games', name: 'Games' }] },
    { slug: 'application', name: 'Application', subs: [{ slug: 'productivity', name: 'Productivity' }] },
  ],
})
if (typeof categories === 'string') throw new Error(categories)

describe('placement keywords', () => {
  it('writes category and subcategory, replacing an earlier placement and keeping other keywords', () => {
    const before = ['cordis-plugin', 'acrylblends-category-application', 'acrylblends-subcategory-productivity', 'notes']
    expect(withPlacement(before, { category: 'gaming', subcategory: 'games' })).toEqual([
      'cordis-plugin', 'notes', 'acrylblends-category-gaming', 'acrylblends-subcategory-games',
    ])
    expect(withPlacement(before, undefined)).toEqual(['cordis-plugin', 'notes'])
  })

  it('reads back what it wrote; a subcategory alone is no placement', () => {
    expect(placementOf(withPlacement([], { category: 'gaming', subcategory: 'games' }))).toEqual({ category: 'gaming', subcategory: 'games' })
    expect(placementOf(['acrylblends-category-gaming'])).toEqual({ category: 'gaming' })
    expect(placementOf(['acrylblends-subcategory-games'])).toBeUndefined()
    expect(placementOf('gaming')).toBeUndefined()
  })

  it('refuses a slug that is not an address', () => {
    expect(() => withPlacement([], { category: 'Gaming Stuff' })).toThrow(/not a category address/u)
  })

  it('checks against the published list and names it for people', () => {
    expect(placementProblem({ category: 'gaming', subcategory: 'games' }, categories)).toBeUndefined()
    expect(placementProblem({ category: 'cooking' }, categories)).toMatch(/not one of the categories/u)
    expect(placementProblem({ category: 'gaming', subcategory: 'productivity' }, categories)).toMatch(/not a subcategory of Gaming/u)
    expect(placementLabel({ category: 'gaming', subcategory: 'games' }, categories)).toBe('Gaming › Games')
    expect(readCategories({})).toMatch(/no categories/u)
  })
})
