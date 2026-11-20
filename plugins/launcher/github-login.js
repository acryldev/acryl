// The GitHub sign-in of ACRYL Control Center and the apps it starts is ONE implementation, in @acryldev/app-persistence (src/github-login.ts): the device
// flow with ACRYL's own OAuth app, the owner-only `<home>/github.json`, and GH_TOKEN for the gh and git an app starts. The frame inside every app uses the
// same code and the same file, so signing in once, here or in an app, counts in both. This file only keeps the launcher's own names.
export {
  clearGithub,
  GITHUB_CLIENT_ID,
  GITHUB_FILE,
  GITHUB_SCOPE,
  githubClientId,
  githubEnv,
  pollGithubSignIn,
  readGithub,
  saveGithub,
  startGithubSignIn,
} from '@acryldev/app-persistence'
