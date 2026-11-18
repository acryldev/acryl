import { doorEnabled } from './door.ts'

/** A page written in JSX: Node.js runs it through plugins/acryl-node-server/src/register.ts (see the scripts in package.json), which compiles .tsx with this app's own typescript. */
const About = () => (
  <main>
    <h1>About</h1>
    <p>Rendered on the server with the JSX runtime in plugins/acryl-router.</p>
  </main>
)

export const aboutPage = (): string => (<About />).toString()

/** Throws on purpose: the template's test checks that the stack names this file, so a failure in your own pages points at the .tsx line. */
export const failingPage = (): string => {
  throw new Error('a page failed')
}

/** A page with one client component: `src/client/counter.tsx` runs in the browser, compiled on request by `clientModules` (see src/routes.ts). `prefix` is the path the app is mounted at, so the script URL follows it. */
export const counterPage = (prefix = ''): string =>
  (
    <html lang="en">
      <body>
        <h1>Counter</h1>
        <div id="counter" />
        <script type="module" src={`${prefix}/client/counter.tsx`} />
        {doorEnabled() ? <script type="module" src="/api/acryl-door/page.js" /> : null}
      </body>
    </html>
  ).toString()
