// Example: settings-section.basic
// Type:     settings-section
// Surfaces: tui web desktop
// Teaches:  give a plugin user-editable settings. Export a Schemastery `Config`, then register it as a settings
//           section with `ctx.settings.installSection(ctx, NAMESPACE, Config, config, { validate, setSource, onChange })`
//           inside `ctx.inject(['settings'], ...)` so the plugin still mounts where no settings service exists.
//           `setSource` hands you a function returning the CURRENT value (read it on use, never cache it); `onChange`
//           fires after a user edit; `validate` refuses an invalid write before it is stored. A field with
//           `.role('secret')` never appears in responses. On Web and Desktop the browser settings page can render a card
//           for the namespace (see extending.client-slot: `settings.plugin.item`); without a card the values are still
//           editable in the user settings document.
// Expect:   row ACTIVE; the namespace "acryl-example-settings" is served by the settings service when it exists.
// Docs:     extending.config-schema
import Schema from '@deepseek-ai/schemastery'

export const name = 'acryl-example-settings-section'
export const NAMESPACE = 'acryl-example-settings'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello'),
  loud: Schema.boolean().default(false),
})

export function apply(ctx, config) {
  let current = () => config
  ctx.inject(['settings'], (scoped) => {
    scoped.settings.installSection(ctx, NAMESPACE, Config, config, {
      validate: value => { if (String(value.greeting).length > 40) throw new Error('greeting is too long (max 40)') },
      setSource: source => { current = source },
      onChange: () => { ctx.logger.info(`[settings-example] now: ${JSON.stringify(current())}`) },
    })
  })
  ctx.logger.info(`[settings-example] initial: ${JSON.stringify(current())}`)
}
