/**
 * Inert demo plugin named by BLEND lock rows.
 *
 * The desktop composes a selected BLEND's rows as loader entries; each row's
 * `name` must resolve to an installed package (spec 003, D22/D24). This
 * package is that resolvable target for the acryl.crm fixture: it owns no
 * services, tools, or client surface, and only proves activation plus config
 * propagation by logging once per mounted row.
 */

export const name = 'acryl-blend-demo'

export function apply(ctx, config = {}) {
  const rendered = Object.keys(config).length > 0 ? JSON.stringify(config) : '(no config)'
  console.log(`[acryl-blend-demo] row active with config: ${rendered}`)
}
