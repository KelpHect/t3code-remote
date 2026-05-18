# Ionic Vue Mobile Plan

Last updated: 2026-05-18

## Goal

Build a first-party T3 Code mobile app in Ionic Vue and Capacitor. The app must
feel like a clean mobile chat product first, closer to ChatGPT mobile than a
desktop control panel. It must still expose T3 Code's project, thread, diff, git,
filesystem, and terminal workflows, but those workflows belong behind mobile
navigation, sheets, drawers, and focused screens instead of wide tab bars or
dense tool panes.

The desktop machine remains the only place running the T3 backend, Codex
app-server, git, files, terminals, and provider sessions. The phone connects to
that existing backend over emulator host networking, LAN, WiFiman Teleport,
Tailscale, or another trusted private network.

## Decision

Implementation target:

- `apps/mobile/`
- Ionic Vue
- Vue 3
- TypeScript
- Capacitor Android first, iOS after Android proves the architecture
- App-owned TypeScript client for auth, discovery, existing `/ws`
  compatibility, reconnect, command outbox, DTO mapping, and persistence

## Current Scaffold State

`apps/mobile/` exists as a normalized Ionic Vue Vite app named
`@t3tools/mobile`.

Present:

- `package.json` with `dev`, `build`, `preview`, `lint`, `typecheck`, `test`,
  `test:watch`, `test:e2e`, and `cap:sync:android` scripts
- `index.html`
- `src/App.vue`
- `src/main.ts`
- `src/router/index.ts`
- chat-first shell under `src/views/ChatPage.vue`
- `src/theme/variables.css`
- `vite.config.ts`
- `tsconfig.json`
- `ionic.config.json`
- `capacitor.config.ts`
- Capacitor Android project under `apps/mobile/android/`
- mobile README
- Vitest baseline test
- Cypress config and e2e folder

Still to replace:

- T3 Code chat/history/projects/settings/tools screens
- Backend discovery, pairing, or `/ws` compatibility code

Current scaffold checks:

- `bun --cwd apps/mobile lint` passes.
- `bun --cwd apps/mobile typecheck` passes.
- `bun --cwd apps/mobile test` passes.
- `bun --cwd apps/mobile build` passes.
- `bun --cwd apps/mobile cap:sync:android` passes.

## Non-Negotiable Backend Boundary

- Do not change `apps/server`, `apps/web`, `apps/desktop`, `packages/contracts`,
  or shared packages for mobile support.
- Do not require users to install a T3 fork, plugin, modified backend, or
  separately installed adapter.
- The mobile app must work against the original unmodified T3 backend.
- All compatibility code lives in `apps/mobile/` or an app-owned runtime
  shipped by that app.
- Do not add `/api/native/descriptor`, `/native/ws`, mobile-specific RPCs, or
  server-side git progress streams to the existing backend.

Existing backend endpoints to use:

- `GET /api/auth/session`
- `POST /api/auth/bootstrap/bearer`
- `POST /api/auth/ws-token`
- `GET /ws?wsToken=...`

Known auth response fields:

- `/api/auth/bootstrap/bearer` returns `sessionToken`.
- `/api/auth/ws-token` returns `token`.

## Product Shape

Default screen:

- Chat-first layout.
- Header with current thread title, project context, model/mode affordance, and
  menu button.
- Empty state should look like a chat app, not a setup form.
- Composer is fixed at the bottom with message input and send/stop affordance.
- Connection state is a subtle banner or menu item, not the main content once
  the app has a paired backend.

Navigation:

- History/search screen groups threads by recency and project.
- Project screen mirrors T3 desktop's project grouping and active working state.
- Settings/connection screen contains backend discovery, pairing, token
  revocation guidance, private-network warnings, and diagnostics.
- Tools are contextual: diff, git, files, terminal, approvals, and user input
  open as screens or bottom sheets from the current thread/project.

Visual direction:

- Match the simplicity of ChatGPT mobile: clean typography, minimal chrome,
  generous touch targets, focused content, and restrained dark/light themes.
- Match T3 Code's product model: projects contain threads, threads contain chat
  turns and actions, and work surfaces attach to the active project/thread.
- Do not ship a dense dashboard-style UI as the mobile default.

## Discovery Strategy

Discovery must not depend on one hardcoded backend URL.

Android emulator candidates:

- Always probe `http://10.0.2.2:3773` first.
- Also expose manual entry for `http://10.0.2.2:<port>`.

Desktop/local candidates:

- `http://127.0.0.1:3773`
- `http://localhost:3773`

LAN/VPN candidates:

- Probe private IPv4 interface subnets when Capacitor/native APIs allow it.
- Probe default gateways where available.
- Keep manual URL entry for VPNs and restricted networks.

Probe contract:

- A valid backend is any candidate where `GET /api/auth/session` returns T3 auth
  JSON, even when `authenticated` is false.
- Discovery must surface diagnostics: candidate count, probe failures by class,
  and the recommended emulator URL when running on Android emulator.

## Architecture

`apps/mobile/` should own these layers:

- `src/client/auth`: bearer bootstrap, ws-token issue, secure token storage.
- `src/client/discovery`: candidate generation, probes, diagnostics.
- `src/client/ws`: current existing-backend `/ws` compatibility transport.
- `src/client/dto`: app-owned DTOs for shell, thread, diffs, git, files, and
  terminal.
- `src/client/state`: reconnect loop, outbox, sequence filtering, local drafts.
- `src/stores`: Pinia stores or equivalent Vue-owned state for screens.
- `src/views`: Ionic pages for chat, history, projects, tools, and settings.
- `src/components`: mobile UI components, not protocol logic.
- `src/capacitor`: platform adapters for secure storage, network info, haptics,
  and Android/iOS permissions.

Private `/ws` wire-format assumptions must stay inside the compatibility
transport and fixture tests. Vue components and stores consume app-owned DTOs.

## Initial Screens

1. Chat home
   - Current or empty thread.
   - Message list.
   - Composer.
   - Model/mode control.
   - Stop/continue/send.

2. History
   - Search.
   - Recency groups.
   - Project badges.
   - Thread title and last activity.

3. Projects
   - T3 desktop-style project grouping.
   - Active/working state.
   - Thread counts.
   - Add project and clone entry points.

4. Connection and settings
   - Auto-discovered backends.
   - Manual backend URL.
   - Pairing token/URL input.
   - Private-network warning.
   - Diagnostics for failed discovery.

5. Tools
   - Diff viewer.
   - Git actions and progress.
   - Filesystem browse and clone.
   - Terminal scrollback/input.
   - Approvals and user input prompts.

## Implementation Order

1. Normalize the existing `apps/mobile/` Ionic starter: package metadata,
   scripts, ESLint dependencies, Vitest setup, Vite plugins, README, Capacitor
   config, Android platform, and workspace hygiene.
2. Replace the starter tabs with a ChatGPT-style mobile shell using static data
   and emulator screenshots before protocol work.
3. Build history, projects, settings/connection, and contextual tools screens
   around static T3 Code fixture data.
4. Implement discovery with guaranteed emulator host probing and diagnostics.
5. Implement bearer pairing and secure storage.
6. Capture current `/ws` fixtures from an unmodified local T3 backend.
7. Implement TypeScript existing-`/ws` compatibility transport and fixture drift
   tests.
8. Subscribe to shell state and render real projects/history.
9. Subscribe to thread state and render chat turns/actions.
10. Implement send/continue/stop with client-generated command IDs and outbox
    retry.
11. Add model/mode controls.
12. Add diff, git, files/clone/project creation, and terminal tool screens.
13. Validate Android emulator, physical Android over VPN/LAN, and reconnect after
    app background/network interruption.
14. Start iOS only after Android passes the architecture and UX gate.

## Acceptance Gates

Root repository:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`

Mobile app after scaffold normalization:

- `bun --cwd apps/mobile lint`
- `bun --cwd apps/mobile typecheck`
- `bun --cwd apps/mobile test`
- `bun --cwd apps/mobile build`
- `bun --cwd apps/mobile cap:sync:android`
- Android emulator install/launch/screenshot evidence

Manual Android beta gate:

- App auto-discovers `http://10.0.2.2:3773` when the desktop app is running on
  this machine.
- App pairs with a pairing token from the existing backend.
- App lists real T3 projects and threads.
- App opens an existing thread, sends a turn, continues/stops, and syncs with the
  desktop app.
- App changes model/mode, views diffs, runs git actions, browses files, and opens
  a terminal.
- App survives background/foreground and VPN/network interruption without losing
  synchronized state.

## Android Setup Notes

Installed locally:

- Android SDK: `/home/kellhect/Android/Sdk`
- AVD: `MyAndroidAVD`
- `adb` and `emulator` are available after sourcing shell rc files.
- Valid JDK: `/usr/lib/jvm/java-17-temurin-jdk`

Use before Android CLI work:

```sh
source ~/.zshrc
adb devices
emulator -list-avds
```

For Capacitor Android, Android Studio Panda is installed and should own Gradle,
SDK manager, emulator, and device inspection. Generated Android project files
under `apps/mobile/android/` are app-owned mobile artifacts.

## Open Risks

- Existing `/ws` is still private backend wire format. Drift fixture tests are
  required before real beta usage.
- Ionic gives the right UI control, but the app still needs careful list
  virtualization for long chats, diffs, git logs, and terminal output.
- Android cleartext must remain scoped to paired private hosts.
- iOS requires macOS/Xcode/signing and is deferred.
