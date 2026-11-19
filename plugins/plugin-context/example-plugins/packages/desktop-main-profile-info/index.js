// Example: desktop-main.profile-info
// Type:     desktop-main
// Surfaces: tui web desktop (Desktop has the full service; Web and CLI provide a subset)
// Teaches:  using the profile Host services. `desktopProfiles.current` ({ name, dir }) exists on EVERY surface
//           (Web's profile is always named `web`). Only Desktop also has `list()`, `create()`, `select()` and
//           `delete()`, so feature-test a member before calling it: this example does. `desktopPnpm` runs
//           pnpm/dsh plugin operations in the active profile; `livePluginActivation` activates and deactivates
//           a plugin without a restart. Declare what you need in `inject` (a surface without it leaves the row
//           PENDING, healthy and waiting), or read it with `ctx.get(...)` at CALL time when it is optional.
// Expect:   ACTIVE on all three surfaces; logs the active profile (and the profile list on Desktop).
// Docs:     extending.desktop-main
// Pattern:  apps/acryl-desktop/src/profile-service.ts, docs/reference/cordis-guides (hello-world-plugin-guide)
export const name = 'acryl-example-profile-info'
export const inject = ['desktopProfiles']

export function apply(ctx) {
  const profiles = ctx.desktopProfiles
  const { current } = profiles
  // `list` exists on Desktop only; never assume a member the surface may not provide.
  const names = typeof profiles.list === 'function' ? profiles.list().map(profile => profile.name) : [current.name]
  ctx.logger.info(`[profile-info] active profile "${current.name}" at ${current.dir}; available: ${names.join(', ')}`)
}
