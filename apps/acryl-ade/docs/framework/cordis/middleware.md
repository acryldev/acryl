# Middleware in Cordis

Middleware belongs to an `Acryl`; it is not a separate Cordis registration, and it disappears with the mount that serves it. A plugin may
build middleware from an injected service, but resources the middleware uses (timers, watchers, connections) are acquired in the plugin's
`ctx.effect()` and only the finished middleware goes into the app. Do not start timers, watchers or sockets from a handler.

Middleware an app registers with a path wraps the matching routes of every later mount too (an app mounted at `/` with
`app.use('/todo/*', ...)` wraps a plugin mounted at `/todo`), so a host can put a guard in front of other plugins by mounting first.
