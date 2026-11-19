// Example: service.provider
// Type:     service-provider
// Surfaces: tui web desktop
// Teaches:  a Service subclass provides a named service; export the class as `apply`.
// Expect:   row ACTIVE; ctx.greeter resolves.
// Docs:     extending.service
// Pattern:  handbook part 6, ch03/ch13 of the cordis tutorial
import { Service } from '@deepseek-ai/cordis'

export const name = 'acryl-example-greeter'

export class Greeter extends Service {
  constructor(ctx) {
    super(ctx, 'greeter')
  }

  greet(who) {
    return `Hello, ${who}!`
  }
}

export { Greeter as apply }
