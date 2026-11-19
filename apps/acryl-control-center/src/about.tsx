/** A page written in JSX: the scripts in package.json run Node.js with the vendored register hook (plugins/acryl-node-server/src/register.ts), which compiles .tsx with this app's own typescript. */
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
