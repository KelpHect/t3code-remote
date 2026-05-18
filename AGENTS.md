# AGENTS.md

## Scope

- Default to changing repository code directly when asked to implement; do not stop at proposals unless the user explicitly asks for planning or investigation only.
- Preserve the hard product boundary for native work: implement only in `apps/native-avalonia/` and synchronized docs. Do not change existing backend, web, desktop, or shared package code to support native/mobile.
- Native mobile must work against an unmodified original T3 backend. Implement all protocol parsing, compatibility, mapping, retry, persistence, bundled app-owned helper services, and UI work in the native app instead of requiring a T3 fork or changes to existing backend/web/desktop/shared code.
- Do not implement or plan `/api/native/descriptor`, `/native/ws`, new RPC behavior, server-side git progress streams, server-side mobile affordances, package contract changes, or web/desktop changes in the existing T3 codebase for native support.
- Bundled app-owned compatibility runtimes are allowed when they live under `apps/native-avalonia/`, ship with our app, require no separate user installation, and only communicate with the original T3 backend through behavior already available to the existing desktop/web app.
- If existing backend behavior is awkward, mirror the desktop client's behavior from the native app or an app-owned compatibility runtime and isolate the awkwardness behind native interfaces.

## Project

- This is an early WIP for T3 Code, a local/remote GUI for coding agents such as Codex, Claude, and OpenCode.
- Prefer maintainability fixes inside the native app when they remove duplicated logic or harden failure behavior, but keep unrelated churn out of focused tasks.
- Do not commit unless explicitly asked. Final responses should summarize changed paths and the exact checks run.
- The native Avalonia spike lives in `apps/native-avalonia/`; it is intentionally not a PWA, Expo app, or wrapper around `apps/web`.

## Completion Gates

- Required root gates before task completion: `bun fmt`, `bun lint`, and `bun typecheck`.
- Tests must be run with `bun run test`; never run `bun test`.
- On this machine, full root tests need C locale passthrough for existing git stderr assertions:
  `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`.
- `bun lint` currently exits successfully while reporting existing warnings in web/client code. Treat new warnings in touched files as failures.
- If Electron reports an incomplete install during tests, run its postinstall script rather than changing test code.
- Native client gates after touching `apps/native-avalonia/`:
  `dotnet test apps/native-avalonia/T3Code.Native.Tests/T3Code.Native.Tests.csproj`
  and `dotnet build apps/native-avalonia/T3Code.Native.App.Desktop/T3Code.Native.App.Desktop.csproj`.
- Android gates require `ANDROID_HOME=/home/kellhect/Android/Sdk`, SDK tools on `PATH`, at least one AVD, and the installed `android` .NET workload. Source `~/.zshrc` or `~/.bashrc` in non-interactive shells before checking these.
- Refreshed zsh/bash shells resolve Java to `/usr/lib/jvm/java-17-temurin-jdk`; if a shell still resolves `java` to `/usr/lib/jvm/java-25-openjdk`, source the shell rc file before Android builds.
- Do not claim Android/iOS validation from desktop builds. Device/emulator run evidence is required.

## Priorities

1. Correctness and reliability under reconnects, restarts, partial streams, and provider failures.
2. Performance under long sessions, large streams, large diffs, and terminal output.
3. Predictable remote behavior over LAN/VPN and SSH-launched environments.
4. Maintainability through shared native protocol/state code instead of duplicated local fixes.
5. Mobile polish only after protocol, sync, cancellation, and persistence are reliable.

## Stack

- Runtime monorepo: Bun workspaces, Turbo, TypeScript, Effect schemas, Vitest, React/Vite web, Electron desktop, Node server.
- `apps/server` brokers provider sessions, starts Codex app-server over stdio, exposes HTTP auth, WebSocket RPC, filesystem, git/VCS, terminal, and orchestration behavior.
- `apps/web` owns the current React UI and consumes orchestration events over WebSocket push.
- `apps/native-avalonia` is .NET 10/Avalonia 12.0.3 with Android/iOS/desktop/browser projects, plus a reusable `T3Code.Native.Client`.
- The existing backend exposes bearer pairing at `/api/auth/bootstrap/bearer` and short-lived WS tokens at `/api/auth/ws-token`.
- The native app must target the existing backend `/ws` protocol after pairing. Any private wire-format dependency must be isolated behind compatibility code inside `apps/native-avalonia/`.

## Documentation Paths

- Keep `TODO.md` synchronized with production-readiness status after audits or major implementation batches.
- Keep `plan_mobile.md` synchronized with native mobile strategy, setup, and acceptance gates.
- Keep `REMOTE.md` synchronized only when documentation about existing remote pairing, LAN/VPN, SSH launch, Tailscale, or auth behavior changes; do not change remote backend behavior for native support.
- Keep `apps/native-avalonia/README.md` synchronized when native setup, backend boundary, or validation commands change.

## Architecture Boundaries

- Do not connect native/mobile clients directly to Codex app-server. T3's server owns provider processes, filesystem, git, terminals, and session state.
- Native and web clients must be peers over the backend, not two independent sources of truth.
- Use client-generated command IDs for retryable orchestration commands; server-side command receipt dedupe is the authority when available.
- Apply orchestration snapshots/events only in increasing sequence order. Preserve sequence filtering in native state code.
- Keep native transport, auth, protocol DTOs, existing-`/ws` compatibility, reconnect, and outbox behavior in `T3Code.Native.Client`; keep UI state and view models in `T3Code.Native.App`. If an app-owned compatibility runtime is needed, keep it under `apps/native-avalonia/` behind the same client-facing interfaces.
- Existing `/ws` compatibility belongs in contained native transport/protocol/runtime code. Do not leak Effect RPC private wire-format assumptions into view models, persistence, or domain state.

## Data And Persistence

- Backend state, provider sessions, projects, threads, git status, terminal sessions, and files remain server-owned.
- Native composer drafts are device-local.
- Store bearer tokens behind `ISecretStore`; the in-memory store is acceptable only for tests/spike wiring, not production mobile persistence.
- Pairing URLs and pairing tokens are credentials. Do not log them, persist them in plaintext, or include them in screenshots/test fixtures.
- Temporary test directories must be cleaned up by tests; do not rely on persistent machine state except documented Android SDK paths.

## Frontend/UI Rules

- Web UI changes stay React/Vite; native UI changes stay Avalonia MVVM.
- Native screens should be functional app surfaces, not marketing pages.
- For mobile, prove layout on emulator/device screenshots before claiming polish. Text must not overlap or depend on desktop-width panels.
- Long chat, diff, git progress, and terminal views need virtualization or bounded rendering before production readiness.
- Cleartext HTTP may be used only for paired private LAN/VPN endpoints and must remain visibly framed as private-network access.

## Security/Safety

- Default remote exposure is private-network/VPN only; do not add public-port assumptions without explicit product approval.
- Pairing credentials are one-time bootstrap credentials; use session revocation paths in existing auth controls for lifecycle management.
- Native cleartext support must be host-scoped and paired-host only. Do not create broad arbitrary HTTP browsing behavior.
- Native compatibility code must enforce bearer/ws-token auth, malformed-message denial, cancellation cleanup, and parity with existing desktop/web behavior.
- Terminal, filesystem, git, and clone actions are high-impact. Preserve existing backend permission boundaries and confirmation/approval flows.

## Tests And Fixtures

- Existing `/ws` compatibility tests must cover auth, request/response, subscriptions, cancellation, reconnect, malformed messages, expired `wsToken`, duplicate command retry, and drift fixtures captured from the current backend.
- Native client tests must cover JSON encode/decode, reconnect replay, command outbox behavior, stream cancellation, protocol errors, and sequence ordering.
- Do not collapse production compatibility matrix tests into broad smoke tests when individual failure paths are useful.
- When test failures depend on localized git stderr, verify with C locale before changing product code.

## Release/Deployment

- Desktop release automation is driven by existing Bun/Electron scripts; do not mix native Avalonia packaging into those scripts until the release boundary is designed.
- Android release needs an explicit package id, signing strategy, versioning, emulator/device smoke test, and APK/AAB artifact path before it is releasable.
- iOS release requires macOS/Xcode/signing validation. Linux-only .NET checks are not enough.
- Native desktop work follows the same app-only rule: it is a client, or a bundled app-owned compatibility runtime plus client, for the existing T3 backend. It is not a reason to modify existing backend/web/desktop code.

## Lessons Learned

- Root `bun run test` can fail on Portuguese Git stderr unless Turbo passes C locale through with `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C`.
- Android Studio installed the SDK under `/home/kellhect/Android/Sdk`; refreshed zsh/bash shells put `adb` and `emulator` on `PATH`.
- The .NET `android` workload is installed.
- `emulator -list-avds` shows `MyAndroidAVD`, and `adb devices` has shown `emulator-5554`.
- `platforms/android-36/android.jar` exists, and plain `dotnet build apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj` passes after sourcing zsh/bash rc files.
- Android debug APKs must embed assemblies for plain `adb install`; otherwise Mono aborts on launch with a fast-deployment `No assemblies found` error.
- The native spike can pair using existing backend auth; full functionality depends on implementing the original backend `/ws` compatibility layer in the app, not on server changes.
- Existing auth response field names are `sessionToken` from `/api/auth/bootstrap/bearer` and `token` from `/api/auth/ws-token`; do not invent `bearerToken` or `wsToken` native DTO fields for those HTTP responses.

## Blockers

- Stop before changing existing backend/web/desktop/shared package code for native support. The current product direction forbids changing existing T3 code for native support.
- Stop and report a concrete blocker only after exhausting native-app options, including a bundled compatibility runtime. Do not convert the blocker into changes to existing T3 code.
- Stop and ask before storing production tokens outside a platform secure store.
- Stop and ask before exposing T3 over a public network, adding unauthenticated endpoints, or weakening pairing/session revocation.
- Stop and ask if Android/iOS signing credentials, app IDs, or store distribution accounts are needed and not available.
