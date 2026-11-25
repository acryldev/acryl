# 054 ACRYL apps on phones (and Tauri as another shell)

Status: draft, written for the owner's decision (2026-11-25). Nothing here is measured yet; every claim about Tauri, Capacitor or nodejs-mobile is
from general knowledge and is checked by the spikes below before anything is built on it.

## The owner's words (2026-11-25)

"also write this down as new spec, as i wanna try Tauri as yet another option, or consider other solutions to produce with ACRYL mobile apps"

Before that, the assessment the owner pasted back (this session, 2026-11-25): Tauri could work for desktop but would be a third desktop shell for
little gain over Electrobun; where it really wins is mobile (Tauri 2 builds iOS and Android apps, which Electron and Electrobun cannot). Recommendation
then: do not add Tauri for desktop now; finish Electrobun first; revisit Tauri for phones, as a spike like the Electrobun one.

## What an ACRYL app is, and why phones are different

An ACRYL app is a **Host** (Node or Bun: the page server, Cordis plugins, agents, `npm install`, `node-pty` terminals, `koffi` native calls) and a
**window** that shows the page the Host serves on localhost. Live plugins and hot reload happen in the Host; any webview shows the result.

| | Electron (today) | Electrobun (spec 052, released 2026-11-23) | Tauri 2 |
|---|---|---|---|
| Window engine | bundled Chromium | system webview (WebKit / WebView2 / WebKitGTK) | system webview, the same as Electrobun |
| Backend runtime | Node, built in | Bun, built in | none for JS: a Rust core only |
| Our Host | runs in its Node | runs in its Bun | must run as a **sidecar**: a separate Node or Bun binary the app ships and starts |
| Size | ~250-700 MB per app (less with the shared install) | small (ADE: 71 MB download vs 205.5 MB, measured) | shell ~5-10 MB plus the sidecar runtime (~40-100 MB) |
| Phones | no | no | **iOS and Android** |

On a phone the Host cannot run the way it does on a computer:
- **iOS** allows no second process and no JIT for an app's own code: a Node or Bun sidecar cannot be started. JavaScript runs only inside the
  webview's engine, or in an embedded interpreter without JIT.
- **Android** can start a bundled binary, but an app has no terminal, and `node-pty`, `koffi` and `npm install` at run time do not fit.
- So the coding agent, terminals and live `npm install` stay where a computer is: on the person's own machine or on WebBoxes.ai.

## The options

| Option | What the phone app is | Where the Host runs | What it costs us | Strength |
|---|---|---|---|---|
| A. Remote Host, any shell | a window on a Host elsewhere | WebBoxes.ai, or the person's own computer (a tunnel) | the smallest shell; sign-in and a reachable Host | everything works, agents included, from day one |
| B. PWA (no store) | the app's page installed from the browser | the same as A | nothing new: the page exists | zero build; no app store; weaker offline and device access |
| C. Tauri 2 mobile | a store app (iOS, Android) with a webview | A's Host, or the page alone with a small local store | a Rust toolchain, Xcode and Android SDK in CI, store accounts | one shell family for desktop and mobile; signing, updater, permissions |
| D. Capacitor | a store app wrapping the web page, with native plugins in JS | the same as C | Xcode and Android SDK, store accounts; no Rust | the most mature web-to-store path; large plugin ecosystem |
| E. On-device Host (nodejs-mobile) | the Host itself inside the app | the phone (Node without JIT on iOS) | the heaviest: our plugins without native modules, no terminals, no `npm install` | works offline; slow and limited |

The likely shape: **A or B first** (it needs almost nothing new and every ACRYL app gets a phone face), then **C or D** when an app needs the app
stores, the camera, notifications or offline. E only if an app must run its own logic offline on the phone.

## Plan: spikes before decisions, like the Electrobun one

| Step | What | Proof |
|---|---|---|
| S1 | PWA: a running app's page installable on a phone (manifest, icon, service worker for the shell), opened against a Host on WebBoxes.ai and against the person's own computer | it installs on iOS Safari and Android Chrome, the chat works, a live plugin appears without reinstalling |
| S2 | Tauri 2 mobile spike: the Blank app as an iOS and an Android build whose webview opens a remote Host (S1's page) | it builds in CI, installs on a device or simulator, sizes recorded beside Electron and Electrobun |
| S3 | Capacitor spike, the same app and the same checks | the same, so C and D are compared on measured facts |
| S4 | (optional) nodejs-mobile: can the Host start on Android at all, what of the frame and the plugins loads | a written list of what runs and what does not |
| S5 | the owner chooses: which shell for store apps, and whether Tauri also replaces anything on desktop | decision recorded here |

## Desktop: Tauri as a third shell

Not now (the assessment above): our Host needs a JS runtime anyway, so Tauri on desktop is "Electrobun plus a Rust build", and spec 052 wants two
shell seams (Electron, Electrobun), not three. Revisited at S5 only if S2 shows a reason (for example one shell for desktop and mobile).

## Decisions for the owner

1. Phone face first through a remote Host (PWA, S1) before any store app?
2. Spike both Tauri 2 and Capacitor (S2, S3), or Tauri only?
3. Store accounts (Apple Developer, USD 99 a year; Google Play, USD 25 once) are needed for C and D: when, and in whose name? (Asked before any
   account is made.)

## Out of scope

An on-phone coding agent with terminals; our own app store; desktop changes before S5.
