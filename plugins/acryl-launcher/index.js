// acryl-launcher (spec 050): the journeys every launcher face offers and the session that walks them. No dependencies; the faces (the terminal one in
// apps/acryl-launcher, the desktop one later) only draw the session's states.
export { APP_NAME, JOURNEYS, STARTERS, appNameProblem, commandLine, journey, nameFromId, whereProblem } from './journeys.js'
export { APP_MARKER, REGISTRY_FILE, SURFACES, addApp, blendOf, inspectApp, readApps, removeApp } from './apps-registry.js'
export { runAppsCommand } from './apps-command.js'
export { createSession } from './session.js'
export { MODEL_FILE, PROVIDERS, clearModelKey, keyProblem, maskKey, modelEnv, readModelKey, runModelCommand, saveModelKey } from './model-key.js'
