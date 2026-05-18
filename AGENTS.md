# AGENTS.md

## Scope

- Default to changing repository code directly when asked to implement; do not
  stop at proposals unless the user explicitly asks for planning or
  investigation only.
- Active mobile work belongs in `apps/mobile/` and synchronized docs.
- Mobile must work against an unmodified original T3 backend. Implement
  discovery, protocol parsing, compatibility, mapping, retry, persistence,
  helper runtimes, and UI inside the mobile app instead of requiring a T3 fork or
  changes to existing backend/web/desktop/shared code.
- Do not implement or plan `/api/native/descriptor`, `/native/ws`, new RPC
  behavior, server-side git progress streams, server-side mobile affordances,
  package contract changes, or web/desktop changes in the existing T3 codebase
  for mobile support.
- Bundled app-owned compatibility runtimes are allowed when they live under
  `apps/mobile/`, ship with the app, require no separate user
  installation, and only communicate with the original T3 backend through
  behavior already available to the existing desktop/web app.

## Project

- This is an early WIP for T3 Code, a local/remote GUI for coding agents such as
  Codex, Claude, and OpenCode.
- Do not commit unless explicitly asked. Final responses should summarize
  changed paths and the exact checks run.
- The active mobile target is Ionic Vue plus Capacitor Android/iOS in
  `apps/mobile/`.
- The mobile app is not a PWA-only target, not Expo, and not a wrapper around
  `apps/web`.

## Completion Gates

- Required root gates before task completion: `bun fmt`, `bun lint`, and
  `bun typecheck`.
- Tests must be run with `bun run test`; never run `bun test`.
- On this machine, full root tests need C locale passthrough for existing git
  stderr assertions:
  `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`.
- `bun lint` currently exits successfully while reporting existing warnings in
  web/client code. Treat new warnings in touched files as failures.
- If Electron reports an incomplete install during tests, run its postinstall
  script rather than changing test code.
- After `apps/mobile/` exists, mobile gates are:
  `bun --cwd apps/mobile lint`,
  `bun --cwd apps/mobile typecheck`,
  `bun --cwd apps/mobile test`,
  `bun --cwd apps/mobile build`, and
  `bun --cwd apps/mobile cap:sync:android`.
- Current mobile scaffold baseline is not clean yet: lint is missing
  `@typescript-eslint/eslint-plugin`, the starter unit test fails importing the
  generated tab page, and the starter legacy Vite plugin emits unsupported
  `output.format: system`. Fix those before treating mobile checks as gates for
  feature work.
- Android gates require `ANDROID_HOME=/home/kellhect/Android/Sdk`, SDK tools on
  `PATH`, at least one AVD, and Android Studio/Capacitor Android setup. Source
  `~/.zshrc` or `~/.bashrc` in non-interactive shells before checking these.
- Do not claim Android/iOS validation from browser builds. Device/emulator run
  and screenshot evidence are required.

## Priorities

1. Mobile UX quality: chat-first, simple, and closer to ChatGPT mobile than a
   desktop control panel.
2. Correctness and reliability under reconnects, restarts, partial streams, and
   provider failures.
3. Compatibility with an unmodified original T3 backend.
4. Performance under long sessions, large streams, large diffs, and terminal
   output.
5. Predictable remote behavior over emulator host networking, LAN, VPN, and
   SSH-launched environments.
6. Maintainability through app-owned protocol/state code instead of duplicated
   view-level fixes.

## Stack

- Runtime monorepo: Bun workspaces, Turbo, TypeScript, Effect schemas, Vitest,
  React/Vite web, Electron desktop, Node server.
- `apps/server` brokers provider sessions, starts Codex app-server over stdio,
  exposes HTTP auth, WebSocket RPC, filesystem, git/VCS, terminal, and
  orchestration behavior.
- `apps/web` owns the current React desktop-style UI and consumes orchestration
  events over WebSocket push.
- `apps/mobile` is the active mobile app target: Ionic Vue, Vue 3,
  TypeScript, Capacitor Android first, iOS later.
- The existing backend exposes bearer pairing at `/api/auth/bootstrap/bearer`
  and short-lived WS tokens at `/api/auth/ws-token`.
- The mobile app must target the existing backend `/ws` protocol after pairing.
  Any private wire-format dependency must be isolated behind compatibility code
  inside `apps/mobile/`.

## Documentation Paths

- Keep `TODO.md` synchronized with production-readiness status after audits or
  major implementation batches.
- Keep `plan_mobile.md` synchronized with the Ionic Vue mobile strategy, setup,
  and acceptance gates.
- Keep `REMOTE.md` synchronized only when documentation about existing remote
  pairing, LAN/VPN, SSH launch, Tailscale, or auth behavior changes; do not
  change remote backend behavior for mobile support.
- After scaffold, keep `apps/mobile/README.md` synchronized when mobile
  setup, backend boundary, UI direction, or validation commands change.

## Architecture Boundaries

- Do not connect mobile clients directly to Codex app-server. T3's server owns
  provider processes, filesystem, git, terminals, and session state.
- Mobile and desktop/web clients must be peers over the backend, not independent
  sources of truth.
- Use client-generated command IDs for retryable orchestration commands;
  server-side command receipt dedupe is the authority when available.
- Apply orchestration snapshots/events only in increasing sequence order.
- Keep auth, discovery, existing-`/ws` compatibility, reconnect, outbox, DTO
  mapping, and persistence in app-owned client modules under
  `apps/mobile/src/client/`.
- Vue stores and Ionic components must consume app-owned DTOs. They must not
  parse private Effect RPC frames directly.
- If an app-owned compatibility runtime is needed, keep it under
  `apps/mobile/` behind the same client-facing interfaces.

## Data And Persistence

- Backend state, provider sessions, projects, threads, git status, terminal
  sessions, and files remain server-owned.
- Mobile composer drafts are device-local.
- Store bearer tokens behind a Capacitor secure-storage abstraction before
  production beta. In-memory or localStorage token storage is test-only.
- Pairing URLs and pairing tokens are credentials. Do not log them, persist them
  in plaintext, or include them in screenshots/test fixtures.
- Temporary test directories and generated fixtures must be cleaned up or stored
  under documented app-owned paths.

## Frontend/UI Rules

- Web UI changes stay React/Vite; mobile UI changes stay Ionic Vue.
- The mobile default surface is chat, not settings, diagnostics, tabs, or a
  dashboard.
- Match the requested ChatGPT-like mobile shape: clean header, history/search
  screen, project grouping, settings/connection screen, bottom composer, and
  contextual tool screens/sheets.
- T3 Code-specific surfaces still matter: projects contain threads, active work
  state is visible, and diffs/git/files/terminal attach to the active
  project/thread.
- Do not ship wide desktop tab bars, dense button grids, or XML-style control
  panels as the mobile UX.
- Use Ionic components and Vue state ownership instead of hand-rolled mobile
  primitives when Ionic provides the expected behavior.
- Prove layout on emulator/device screenshots before claiming polish. Text must
  not overlap, clip, or depend on desktop-width panels.
- Long chat, diff, git progress, and terminal views need virtualization or
  bounded rendering before beta.

## Security/Safety

- Default remote exposure is private-network/VPN only; do not add public-port
  assumptions without explicit product approval.
- Pairing credentials are one-time bootstrap credentials; use session revocation
  paths in existing auth controls for lifecycle management.
- Cleartext HTTP may be used only for paired private LAN/VPN/emulator endpoints
  and must remain visibly framed as private-network access.
- Mobile compatibility code must enforce bearer/ws-token auth,
  malformed-message denial, cancellation cleanup, and parity with existing
  desktop/web behavior.
- Terminal, filesystem, git, and clone actions are high-impact. Preserve
  existing backend permission boundaries and confirmation/approval flows.

## Tests And Fixtures

- Existing `/ws` compatibility tests must cover auth, request/response,
  subscriptions, cancellation, reconnect, malformed messages, expired `wsToken`,
  duplicate command retry, and drift fixtures captured from the current backend.
- Redacted `/ws` drift fixtures should live under
  `apps/mobile/src/client/ws/__fixtures__/` or another documented mobile
  test fixture path. Keep them token-free and path-redacted.
- Mobile client tests must cover JSON encode/decode, reconnect replay, command
  outbox behavior, stream cancellation, protocol errors, and sequence ordering.
- UI tests should cover the chat shell, history grouping, connection flow,
  backend discovery diagnostics, and key tool entry points.
- When test failures depend on localized git stderr, verify with C locale before
  changing product code.

## Release/Deployment

- Desktop release automation is driven by existing Bun/Electron scripts; do not
  mix Ionic/Capacitor packaging into those scripts until the release boundary is
  designed.
- Android release needs an explicit package id, signing strategy, versioning,
  emulator/device smoke test, and APK/AAB artifact path before it is releasable.
- iOS release requires macOS/Xcode/signing validation. Linux-only checks are not
  enough.

## Lessons Learned

- Root `bun run test` can fail on Portuguese Git stderr unless Turbo passes C
  locale through with `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C`.
- Android Studio installed the SDK under `/home/kellhect/Android/Sdk`;
  refreshed zsh/bash shells put `adb` and `emulator` on `PATH`.
- `emulator -list-avds` shows `MyAndroidAVD`, and `adb devices` has shown
  `emulator-5554`.
- The desktop T3 backend on this machine listens at `127.0.0.1:3773`; Android
  emulator reaches it as `http://10.0.2.2:3773`.
- Existing auth response field names are `sessionToken` from
  `/api/auth/bootstrap/bearer` and `token` from `/api/auth/ws-token`; do not
  invent `bearerToken` or `wsToken` native DTO fields for those HTTP responses.

## Blockers

- Stop before changing existing backend/web/desktop/shared package code for
  mobile support. The current product direction forbids changing existing T3
  code for mobile support.
- Stop and report a concrete blocker only after exhausting mobile-app options,
  including an app-owned compatibility runtime.
- Stop and ask before storing production tokens outside a platform secure store.
- Stop and ask before exposing T3 over a public network, adding unauthenticated
  endpoints, or weakening pairing/session revocation.
- Stop and ask if Android/iOS signing credentials, app IDs, or store
  distribution accounts are needed and not available.
