# @webboxes/app-persistence

Saving an ACRYL app to its own git repository (spec 036, `persistence-and-registries.md`): the secret check on everything about to be committed, the guard that
keeps a private app off a public remote, commit and push, and connecting a remote created through the user's own `gh` login. The use cases depend on two
ports (`GitPort`, `HostingPort`); `gitCli` and `githubHosting` are the adapters. No token is ever read, stored or prompted for.
