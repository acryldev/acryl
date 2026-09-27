// The app-instance module the dev launchers use: the runtime's own (runtime/acryl-harness-runtime/src/instance/), loaded as TypeScript source by Node's
// type stripping, so the launchers and the runtime share one implementation of every isolation rule. An app that carries its own launcher (`acryl new
// --runtime`) gets a copy of that module next to this file and a one-line version of this file pointing at it.
export * from '../../runtime/acryl-harness-runtime/src/instance/index.ts'
