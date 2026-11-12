// acryl-launcher (spec 050): the journeys every launcher face offers and the session that walks them. No dependencies; the faces (the terminal one in
// apps/acryl-launcher, the desktop one later) only draw the session's states.
export { APP_NAME, JOURNEYS, STARTERS, appNameProblem, commandLine, journey, nameFromId } from './journeys.js'
export { createSession } from './session.js'
