/**
 * Where a shared Blend or plugin is listed: one of the 100 categories on acrylblends.github.io/blends and, optionally, one of that category's
 * subcategories. It travels as two package.json keywords, `acrylblends-category-<slug>` and `acrylblends-subcategory-<slug>`, which both
 * registries' hourly discovery read from the package.json it already fetches (a Blend's at its tag, a plugin's in its release tarball). GitHub
 * topics are not used for it: a topic is capped at 50 characters and the longest subcategory keyword is 56. The list itself is published once,
 * as https://acrylblends.github.io/categories.json; a subcategory slug means something only inside its category (15 repeat across categories).
 */

export const CATEGORY_KEYWORD = 'acrylblends-category-'
export const SUBCATEGORY_KEYWORD = 'acrylblends-subcategory-'
/** The one published list of categories and their subcategories. */
export const CATEGORIES_URL = 'https://acrylblends.github.io/categories.json'

export interface Placement {
  /** A category's slug, the last part of its address on /blends: `gaming`. */
  readonly category: string
  /** One of that category's subcategory slugs: `games`. */
  readonly subcategory?: string
}

export interface CatalogCategory {
  readonly slug: string
  readonly name: string
  readonly subs: readonly { readonly slug: string; readonly name: string }[]
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/** The placement written as keywords, replacing any placement the list already had; the other keywords keep their order. */
export function withPlacement(keywords: readonly string[], placement: Placement | undefined): string[] {
  const kept = keywords.filter((word) => !word.startsWith(CATEGORY_KEYWORD) && !word.startsWith(SUBCATEGORY_KEYWORD))
  if (placement === undefined) return kept
  for (const slug of [placement.category, placement.subcategory]) {
    if (slug !== undefined && !SLUG.test(slug)) throw new Error(`"${slug}" is not a category address (lowercase words joined by -, such as gaming)`)
  }
  return [
    ...kept,
    `${CATEGORY_KEYWORD}${placement.category}`,
    ...(placement.subcategory === undefined ? [] : [`${SUBCATEGORY_KEYWORD}${placement.subcategory}`]),
  ]
}

/** The placement keywords name, if any: the first category keyword, and a subcategory only together with a category. */
export function placementOf(keywords: unknown): Placement | undefined {
  if (!Array.isArray(keywords)) return undefined
  const words = keywords.filter((word): word is string => typeof word === 'string')
  const category = words.find((word) => word.startsWith(CATEGORY_KEYWORD))?.slice(CATEGORY_KEYWORD.length)
  if (category === undefined || !SLUG.test(category)) return undefined
  const subcategory = words.find((word) => word.startsWith(SUBCATEGORY_KEYWORD))?.slice(SUBCATEGORY_KEYWORD.length)
  return subcategory !== undefined && SLUG.test(subcategory) ? { category, subcategory } : { category }
}

/** The published list (`categories.json`), or a reason it cannot be read. */
export function readCategories(json: unknown): readonly CatalogCategory[] | string {
  const list = (json as { categories?: unknown } | null)?.categories
  if (!Array.isArray(list) || list.length === 0) return 'the category list has no categories'
  const ok = list.every((c: { slug?: unknown; name?: unknown; subs?: unknown }) =>
    typeof c?.slug === 'string' && typeof c.name === 'string' && Array.isArray(c.subs)
    && c.subs.every((s: { slug?: unknown; name?: unknown }) => typeof s?.slug === 'string' && typeof s.name === 'string'))
  return ok ? (list as CatalogCategory[]) : 'the category list is malformed'
}

/** Why a placement is not on the list, or undefined when it is. */
export function placementProblem(placement: Placement, categories: readonly CatalogCategory[]): string | undefined {
  const category = categories.find((c) => c.slug === placement.category)
  if (category === undefined) return `${placement.category} is not one of the categories on acrylblends.github.io/blends`
  if (placement.subcategory !== undefined && !category.subs.some((s) => s.slug === placement.subcategory)) {
    return `${placement.subcategory} is not a subcategory of ${category.name}`
  }
  return undefined
}

/** The names a person reads: `Gaming › Games`. */
export function placementLabel(placement: Placement, categories: readonly CatalogCategory[]): string {
  const category = categories.find((c) => c.slug === placement.category)
  const sub = category?.subs.find((s) => s.slug === placement.subcategory)
  return [category?.name ?? placement.category, ...(placement.subcategory === undefined ? [] : [sub?.name ?? placement.subcategory])].join(' › ')
}
