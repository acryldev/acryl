# 054 ACRYL Mobile: Blends on phones, opened and controlled from WebBoxes.ai

Status: draft for the owner's decision (2026-11-26). Rewritten from the first draft (2026-11-25) with the discussion in
[`discussion_tauri_reactnative_for_acryl-mobile-apps.md`](discussion_tauri_reactnative_for_acryl-mobile-apps.md). Nothing about Tauri, React Native
or Expo is measured in ACRYL yet: every such claim is general knowledge and is checked by the spikes below before anything is built on it.

## The owner's words

- 2026-11-25: "write this down as new spec, as i wanna try Tauri as yet another option, or consider other solutions to produce with ACRYL mobile
  apps".
- 2026-11-26: "make acryl-mobile 054 spec and suggest what we should take react-native or tauri for mobile apps to be able to run specific blends
  and control their content also as mobile app displayed in webboxes.ai".

So the product is not "ACRYL's desktop app on a phone". It is: **a person opens one of their Blends (a WebBox) on a phone, uses it, and controls
it (asks the agent, sees the versions, publishes), and webboxes.ai shows and hands out that phone face.**

## Recommendation

**React Native with Expo for the phone app; the Blend itself stays a web page in a WebView; the Host stays in the WebBox.** Tauri is the
fallback only if S2 shows Expo cannot do what S3 needs.

| Question | Tauri 2 | React Native + Expo | Why it decides |
|---|---|---|---|
| Show a Blend's own screen | its webview shows the Blend's page | `react-native-webview` shows the same page | a tie: every Blend's screen is a web page served by its Host, so both show it the same way, unchanged |
| The controls around it (box list, chat with the agent, versions, publish, sign-in) | web UI in the webview | real native UI | phones are the place where native UI matters; the controls are few and ours, so writing them once natively is cheap |
| Phone features (camera upload for Content Machine, push when a render or an agent run ends, share sheet) | Tauri plugins (Rust, Swift, Kotlin) | Expo modules (TypeScript), large ecosystem | Expo is TypeScript all the way, like the rest of ACRYL |
| Building for iOS and Android | Rust toolchain, Xcode and Android SDK on our own machines or CI | EAS builds iOS and Android in Expo's cloud | we have no Mac CI for store builds today; EAS removes that |
| Updating the app without the store | a new binary, or the web content | over-the-air JavaScript updates (within the installed native code) | the controls change often in the prototype phase |
| App Store review | a store app that is mostly one webview risks guideline 4.2 (minimum functionality) | native controls plus web content is the normal pattern | the store app must be more than a website in a frame |
| Desktop | Tauri also does desktop | not a desktop shell | not needed: desktop is Electron, and Electrobun is being evaluated (spec 052); a third desktop shell is out of scope |
| Running the ACRYL Host on the phone | no (needs a Node or Bun sidecar, impossible on iOS) | no (Hermes is not Node) | a tie: the Host runs in the WebBox in both |

Tauri's real strength is wrapping an existing web app into desktop and mobile installers with one Rust shell. We already have desktop shells, and
our Blend screens show in any webview, so what is left to decide is the phone-native part, where React Native is stronger. The discussion reached
the same conclusion in its second half (section 8, "React Native + Expo").

## Architecture

The five nouns ([spec 049 plan](../049-framework-architecture/plan.md)): the **App** is the Blend, its **Host** runs in its WebBox,
**Plugins** are Cordis plugins in the Host, the **Surface** on a phone is the ACRYL Mobile app, and the **Driver** is the agent.

```
ACRYL Mobile (Expo, iOS and Android)
  native: sign-in, my boxes, chat with the agent, versions, publish, push, camera, share
  WebView: the Blend's own page (the published copy, or the editor's app canvas)
        |  HTTPS (the box gate) + the Surface protocol (typed commands and events)
WebBoxes.ai: account, boxes, the gate (owner session per box), runner
        |
WebBox: the Blend's Host (Node + Cordis plugins, the agent, files, git versions)
```

- **No Host on the phone.** iOS allows no second process and no JIT for an app's own code; Android has no terminal; `node-pty`, `koffi` and
  `npm install` do not fit. The agent, terminals and installs stay in the WebBox (or on the person's own computer).
- **No downloaded code in the app.** Apple guideline 2.5.2 forbids downloading code that changes the app's features. A Blend's new feature is a
  Cordis plugin in its Host; the phone shows it through the Blend's web page, or through native controls the app already has. A feature that
  needs new native code is a new app release.
- **The Surface protocol** (the discussion's main point, section 10): the native controls talk to the Host through one typed, versioned contract
  (host discovery and sign-in, app identity, commands and events, agent conversation, versions, publish, file upload, reconnection, capability
  discovery), not by scraping the frame's web UI. The web frame, the desktop shells and the phone become clients of the same contract.
- **Sign-in reuses what exists.** The app signs in to webboxes.ai (Supabase), lists the account's boxes, and opens one through the same owner
  entry link the box page uses (`openWebBoxAppFunction`: `/__webbox/enter`, then `/__webbox/view?mode=public` for View live). The WebView keeps
  the box session cookie; nothing new is needed on the gate for S2.

### Shown in webboxes.ai

- The box page gets a **phone view**: the Blend in a phone-sized frame (the same URL, a narrow viewport), and an **Open on phone** QR code that
  opens the box in ACRYL Mobile (a deep link, `acryl://box/<id>`, falling back to the PWA when the app is not installed).
- A published Blend's address (`<app>.webboxes.ai`) opens in the app when it is installed (universal links on iOS, app links on Android).
- The store page of a Blend (acrylblends.github.io) says whether it has a phone face (the capability declaration below).

### Which Blends work on a phone

Not every Blend fits a phone. A declaration in `blend.yaml` (proposed, not an existing field) says what the phone face offers:

```yaml
platforms:
  mobile:
    supported: true          # the Blend's page works in a phone-sized webview
    surface: webview         # webview | native-screens (later)
    needs: [camera, notifications]   # device features the native app provides
```

Example, Content Machine on a phone: record or pick a video (camera, native), upload it to the box, follow transcription and rendering (events),
approve the cut, get a push when the render ends, share the result (share sheet). FFmpeg and HyperFrames stay in the box. The open-city game:
plays in the WebView as the published copy does in a mobile browser.

## Plan: spikes before decisions, like the Electrobun one

| Step | What | Proof |
|---|---|---|
| S1 | PWA, no store: a box's page installable from the phone browser (manifest, icon, service worker for the shell); the frame's layout on a phone-sized screen | it installs on iOS Safari and Android Chrome, open-city plays, the chat works; a list of what breaks in the frame's layout on a phone |
| S2 | Expo shell: sign in to webboxes.ai, list my boxes, open one in a WebView through the owner entry link, View live and Open app | runs in Expo Go and as an EAS build on a real iPhone and Android phone; the box session survives app restarts; open-city plays with sound |
| S3 | Native controls over a first slice of the Surface protocol: chat with the box's agent (send, stream the answer), the versions list, Publish | a change asked from the phone appears in the WebView and as a new version; Publish works; the protocol slice is written down and tested on the Host side |
| S4 | Device features for one real Blend (Content Machine): camera or library upload, progress events, push when the render ends, share | the full phone flow from recording to sharing the finished video |
| S5 | webboxes.ai: the phone view and the Open on phone QR on the box page; deep links and universal links | the QR opens the box in the app; a published address opens in the app |
| S6 | Tauri comparison, only the blank part of S2 (sign-in, box list, WebView) | sizes, build steps and what was harder, written beside S2's, so the choice rests on measurements |
| S7 | The owner decides: React Native for the store app or not, ACRYL Mobile first or per-Blend branded apps, store accounts | the decision recorded here |

## Decisions for the owner

1. React Native with Expo as the mobile Surface, with Tauri only as the S6 comparison? (Recommended.)
2. **ACRYL Mobile first** (one app that opens all of a person's Blends) and branded per-Blend apps later from the same packages? (Recommended: one
   store listing, one review, one native layer; hundreds of near-identical Blend binaries are not worth it now.)
3. Whose name on the stores: Apple Developer (USD 99 a year) and Google Play (USD 25 once) for S2's real-device builds, and an Expo account for
   EAS (free tier first). Asked before any account is made.
4. The app's name: "ACRYL Mobile", or WebBoxes.ai-branded, since it opens WebBoxes?

## Out of scope

The ACRYL Host or a coding agent with terminals on the phone; downloading plugins or native code into the app; our own app store; Tauri or any new
desktop shell (spec 052 owns desktop); rewriting existing Blend screens in React Native (a Blend's page is shown as it is; native screens per Blend
come later, if ever).

## Related

Spec 052 (desktop shells, Electrobun), spec 049 M9 (WebBoxes edit and published copies, the box gate), WebBoxes spec 010 (resource metering: a
phone user's box use is counted the same way). The discussion file keeps the full reasoning, including the first half's Tauri recommendation and
why the second half changed it.
