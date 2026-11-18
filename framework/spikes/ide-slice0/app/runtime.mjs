// What ACRYL's runtime (acryl-harness-runtime) provides to the workspace, as two small services on the framework's side: `acrylWeb` (the carrier's host, port and route registration,
// delegated to DSH's webServer) and `appInstance` (where the app keeps its data).
export const name = 'spike-runtime'
export const inject = ['webServer']
export function apply(ctx) {
  ctx.effect(() => {
    const port = {
      get host() {
        return ctx.webServer.host
      },
      get port() {
        return ctx.webServer.port
      },
      register: (route) => ctx.webServer.register(route),
      registerUpgrade: (route) => ctx.webServer.registerUpgrade(route),
    }
    const web = ctx.reflect.provide('acrylWeb', port)
    const instance = ctx.reflect.provide('appInstance', {
      home: process.env.SPIKE_APP_HOME,
      dshHome: process.env.DSH_HOME,
    })
    return () => {
      void web()
      void instance()
    }
  }, 'spike-runtime')
}
