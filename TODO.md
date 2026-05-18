# T3 Code Production Readiness TODO

Last audit refresh: 2026-05-18

## Audit Scope

Inspected root instructions and roadmap state (`AGENTS.md`, `TODO.md`, `REMOTE.md`, `README.md`), root package scripts (`package.json`, `turbo.json`, `bun.lock` presence), native app docs/code/tests/config (`apps/native-avalonia/**` excluding build `obj` output), Android SDK availability under `/home/kellhect/Android/Sdk`, .NET SDK/workload state, and the latest validation commands from this workspace. Current implementation scope is the native app plus synchronized docs only; existing backend/web/desktop/shared package code is out of scope for native support. App-owned compatibility runtimes or helper services are in scope when they live under `apps/native-avalonia/` and ship inside our app.

## P0 - Native Mobile Bring-Up Blockers

Purpose: make the Avalonia Android spike buildable and runnable on an emulator while preserving compatibility with the existing T3 backend. Risk: high, because no real mobile decision gate is valid until the app runs on Android. Scope guardrail: only `apps/native-avalonia/`, docs, local setup notes, and generated mobile artifacts needed for Android build/run.

### Environment

- [x] Create the native Avalonia app scaffold. Evidence: `apps/native-avalonia/T3Code.Native.App.slnx` contains Android, iOS, browser, desktop, app, client, and tests projects.
- [x] Detect Android SDK install location. Evidence: `adb` and `emulator` exist under `/home/kellhect/Android/Sdk/platform-tools` and `/home/kellhect/Android/Sdk/emulator`.
- [x] Add repeatable local Android environment setup documentation.
      Evidence: `plan_mobile.md` and `apps/native-avalonia/README.md` show `ANDROID_HOME=/home/kellhect/Android/Sdk`, PATH exports, `adb devices`, `emulator -list-avds`, and build/run commands.
- [x] Install the .NET Android workload.
      Evidence: `dotnet workload list` shows `android` version `36.1.53/10.0.100`.
- [x] Create at least one Android AVD or expose one from Android Studio.
      Evidence: `/home/kellhect/Android/Sdk/emulator/emulator -list-avds` prints `MyAndroidAVD`, and `/home/kellhect/Android/Sdk/platform-tools/adb devices` shows `emulator-5554 device`.
- [x] Put Android SDK CLI tools on the shell `PATH`.
      Evidence: after `source ~/.zshrc` or `source ~/.bashrc`, `command -v adb` resolves to `/home/kellhect/Android/Sdk/platform-tools/adb`, `command -v emulator` resolves to `/home/kellhect/Android/Sdk/emulator/emulator`, `adb devices` shows `emulator-5554 device`, and `emulator -list-avds` prints `MyAndroidAVD`.
- [x] Make the Android SDK platform layout compatible with .NET Android.
      Evidence: `/home/kellhect/Android/Sdk/platforms/android-36/android.jar` exists, and Android build now gets past API platform resolution.
- [x] Configure a valid Java SDK for command-line Android builds.
      Evidence: after `source ~/.zshrc` or `source ~/.bashrc`, `java` and `jar` resolve under `/usr/lib/jvm/java-17-temurin-jdk`, and plain Android `dotnet build` passes without `JavaSdkDirectory`.
- [x] Fix invalid Android package id generated from the template.
      Evidence: `ApplicationId` is now `codes.t3.nativeapp` instead of a package path containing Java keyword `native`.

### Mobile Run Gate

- [x] Build and launch the Android native app on emulator.
      Evidence: `dotnet publish apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj -c Debug` produced `codes.t3.nativeapp-Signed.apk`; `adb install -r .../publish/codes.t3.nativeapp-Signed.apk` succeeded; `adb shell am start -n codes.t3.nativeapp/crc6420cdeeba6ca0b5da.MainActivity` launched and focused the app; screenshot captured at `apps/native-avalonia/artifacts/android-emulator-pairing-screen.png`.
- [x] Build the Android native app from a clean project state.
      Evidence: `dotnet clean ...Android.csproj` followed by an Android build passed with explicit SDK/JDK properties; after shell rc refresh, plain `dotnet build apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj` also passes from both zsh and bash.
- [x] Discover existing T3 backends on the reachable private network instead of relying on a hardcoded URL.
      Evidence: `T3BackendDiscoveryClient` probes `GET /api/auth/session` on loopback, Android emulator host, interface, gateway, and private subnet candidates; `MainView` exposes a scan action and discovered backend picker while retaining manual URL entry. `T3BackendDiscoveryTests` covers discovery and `/ws` URI generation.
- [x] Pair with the existing desktop backend using only existing auth endpoints.
      Evidence: native client implements `/api/auth/bootstrap/bearer` and `/api/auth/ws-token` using the existing backend's `sessionToken` and `token` response fields; `NativeAuthClientTests` covers request bodies, bearer authorization, and response decoding. Live validation created a one-time pairing credential through existing `t3 auth pairing create`, exchanged it with the currently running desktop backend at `http://127.0.0.1:3773`, and issued a short-lived ws token without printing secrets. Existing T3 code changes are not part of the plan.
      Acceptance: a discovered or manually entered VPN/LAN backend can exchange a pairing token, receive a bearer session token and ws token, and show the paired state using only native app code.

## P1 - Existing Backend WebSocket Compatibility

Purpose: unblock real chat/project/git/terminal behavior against an unmodified original T3 backend. Risk: high, because the app must consume or translate the current backend `/ws` protocol without letting private wire-format assumptions leak across the native codebase. Scope guardrail: do not change `apps/server`, `apps/web`, `apps/desktop`, `packages/contracts`, or `packages/shared`; implement compatibility inside `apps/native-avalonia/`, including bundled app-owned helper runtimes when needed.

### Protocol

- [x] Choose the production-compatible backend path.
      Evidence: `plan_mobile.md` documents that the active path is compatibility with the original backend from our app, with no T3 fork, existing backend endpoint, or shared package change required. Bundled app-owned compatibility runtimes are allowed.
- [x] Capture current backend `/ws` handshake and RPC frames as compatibility fixtures.
      Evidence: `apps/native-avalonia/T3Code.Native.Tests/Fixtures/ExistingWs/effect-rpc-json-v1.json` records redacted Effect RPC JSON frames for auth bootstrap, ws-token issue, `/ws` connection, request/response calls, subscription chunks, ack, interrupt/cancel, and error exits. Coverage includes shell subscription, thread subscription, dispatch command, turn/full-thread diffs, filesystem browse, source-control lookup/clone, VCS refresh, git action error, and terminal event/open/close frames. `jq empty` validates the fixture JSON.
      Acceptance: fixture files contain redacted request/response/subscription/cancel/error examples for shell subscription, thread subscription, dispatch command, diffs, git, filesystem, and terminal calls; fixtures contain no pairing tokens, bearer tokens, ws tokens, local secrets, or private paths beyond synthetic test paths.
- [ ] Implement an isolated existing-`/ws` compatibility transport in `T3Code.Native.Client`.
      Acceptance: native code can connect to an unmodified backend `/ws` using `/api/auth/ws-token`, perform request/response calls, start subscriptions, receive events, cancel streams, and surface protocol errors through app-owned interfaces; no UI/view model references the private wire format directly.
- [ ] Decide whether direct transport is enough or an app-owned compatibility runtime is needed.
      Acceptance: document the decision with evidence from fixture capture and first shell/thread subscription attempts; if a runtime is needed, it lives under `apps/native-avalonia/`, ships with the app, requires no separate install, and talks only to the original T3 backend.
- [ ] Replace placeholder shell data with existing-backend `orchestration.subscribeShell`.
      Acceptance: Android emulator or phone pairs to a discovered or manually entered local desktop backend, subscribes to shell state over `/ws`, and renders real projects/threads using only native app code.
- [ ] Add drift tests for the compatibility transport.
      Acceptance: tests replay captured fixtures and fail narrowly when original-backend wire shapes change; failures identify the impacted method or envelope.
- [ ] Map existing backend data into app-owned native DTOs.
      Acceptance: UI/view models consume app-owned DTOs only; no view model, persistence type, or screen references the existing backend wire format or helper-runtime protocol directly.

## P2 - Native Client Reliability

Purpose: make the reusable native client robust enough for mobile sleep/VPN transitions and command retries. Risk: high for user trust, moderate for implementation blast radius. Scope guardrail: client library and tests first; UI should consume stable client state instead of owning transport details.

### Transport And State

- [x] Add reconnect replay and subscription cancellation tests. Evidence: `NativeRpcSessionTests.cs` covers replay after reconnect and non-replay after cancellation.
- [x] Add sequence-ordering helper tests. Evidence: `SequenceGateTests.cs` covers increasing sequence behavior.
- [ ] Add command outbox persistence abstraction.
      Acceptance: retryable commands survive process restart in tests through an interface that can later be backed by platform storage.
- [ ] Add ws-token refresh/reconnect flow.
      Acceptance: expired ws-token errors trigger bearer-token ws-token renewal once, retry only retryable operations, and surface final auth denial clearly.
- [ ] Add bounded backoff and network-state reporting.
      Acceptance: tests cover transient disconnect, repeated failure, cancellation, and UI-visible state transitions.
- [ ] Replace in-memory production token storage with platform secure storage.
      Evidence: `MemorySecretStore` exists and is documented as spike-only.
      Acceptance: Android uses a secure platform-backed store or a clearly isolated adapter, with tests for save/load/clear semantics.

## P3 - Native UX Parity For Core Workflows

Purpose: turn the scaffold into a useful mobile client once protocol access exists. Risk: medium-high because long chats/diffs/terminals can become slow or unusable. Scope guardrail: implement core remote workflows before polish.

### Chat And Shell

- [ ] Replace placeholder project/thread lists with `orchestration.subscribeShell`.
      Acceptance: project/thread ordering matches backend snapshots and ignores stale sequence events.
- [ ] Implement thread subscription and chat rendering.
      Acceptance: existing Codex thread loads, long chat scroll remains responsive, approvals/user input render distinctly, and session restart/reconnect does not duplicate messages.
- [ ] Implement send/continue/stop commands with client-generated command IDs.
      Acceptance: duplicate retry sends the same command ID and backend dedupe prevents duplicate turns.
- [ ] Wire model, runtime mode, and interaction mode controls to backend contracts.
      Acceptance: controls use backend-supported options and preserve selected values across reconnect.

### Work Surfaces

- [ ] Add unified diff viewer.
      Acceptance: turn diff and full-thread diff load, large diffs remain scrollable, binary/empty diff states are explicit.
- [ ] Add git status and action progress UI.
      Acceptance: commit, push, commit+push, and PR prep show progress logs through capabilities already available to the existing desktop/web app; any missing progress stream is handled in the native UX as a compatibility limitation, not as a backend change request.
- [ ] Add filesystem browse and clone/project creation.
      Acceptance: browse handles permission errors and large directories; clone reports progress and final project availability.
- [ ] Add terminal scrollback and input.
      Acceptance: open/write/resize/clear/restart/close work against backend terminal sessions, with bounded scrollback and reconnect handling.

## P4 - Mobile Platform Hardening

Purpose: make Android and later iOS safe and shippable. Risk: medium, with security and release implications. Scope guardrail: Android first; iOS remains deferred until Android decision gate passes.

### Android

- [x] Allow cleartext for the Android spike. Evidence: Android manifest has `android:usesCleartextTraffic="true"` and internet permission.
- [ ] Restrict cleartext behavior to paired private hosts before production release.
      Acceptance: arbitrary cleartext hosts are blocked or warned, paired hosts are explicit, and the UI shows VPN/private-network framing.
- [ ] Replace placeholder Android icon/signing/versioning before release.
      Evidence: package id is now `codes.t3.nativeapp` and activity label is `T3 Code`, but release signing, production icon, and versioning policy still need a release pass.
      Acceptance: app id, display name, icon, version name/code, signing inputs, and artifact naming are production-shaped.
- [x] Add Android emulator screenshot/build gate.
      Evidence: `apps/native-avalonia/README.md` documents publish/install/launch/screenshot commands, and `apps/native-avalonia/artifacts/android-emulator-pairing-screen.png` records the Android pairing shell.

### iOS

- [x] Add local-network/ATS plist entries for the iOS scaffold. Evidence: `Info.plist` contains `NSAllowsLocalNetworking` and local network usage text.
- [ ] Defer iOS build until Android proves the architecture.
      Acceptance: `plan_mobile.md` names the macOS/Xcode/signing prerequisites and the Android pass/fail gate before iOS work starts.

## P5 - Native Validation Baseline

Purpose: keep the native app work validated against the existing repository without turning this ledger into a backlog for the existing web/desktop/server product. Risk: medium because root checks still protect compatibility. Scope guardrail: validation may run existing checks, but implementation tasks stay in `apps/native-avalonia/` and docs.

### Baseline Checks

- [x] Root format, lint, typecheck, and tests passed after native scaffold.
      Evidence: `bun fmt`, `bun lint`, `bun typecheck`, and `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test` passed on 2026-05-18.
- [x] Preserve C-locale guidance for root tests without changing existing scripts.
      Evidence: `AGENTS.md` documents `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`; no existing test scripts were changed for native support.

## P6 - Release And Operations

Purpose: define how native artifacts ship without changing existing Electron/server/web release flows. Risk: medium until native release is in scope. Scope guardrail: do not wire release automation into existing app scripts before Android runtime proof.

### Packaging

- [ ] Define native Android artifact path and signing strategy.
      Acceptance: debug APK, release APK/AAB, signing inputs, versioning, and artifact retention are documented.
- [ ] Keep native desktop scoped as a client for the existing backend.
      Acceptance: plan states how the native desktop client connects, pairs, and reuses the same compatibility client/runtime as mobile without changing existing backend/web/desktop code.
- [x] Keep Avalonia release automation separate from existing Electron scripts.
      Evidence: native Avalonia projects are under `apps/native-avalonia/`; no existing `dist:desktop:*` behavior was changed to package Avalonia output.

## Out Of Scope

- Changing `apps/server`, `apps/web`, `apps/desktop`, `packages/contracts`, or `packages/shared` for native support.
- Adding `/api/native/descriptor`, `/native/ws`, new RPCs, or mobile-specific behavior to the existing T3 backend.
- Requiring users to install a T3 fork, modified T3 backend, plugin, or separately installed adapter.
- Treating missing backend affordances as backend work; native app code must adapt, degrade gracefully, or report an app-side compatibility blocker.

## Deferred / Future Work

- Flutter fallback if Avalonia fails the Android decision gate for pairing, stable WebSocket, reconnect after VPN/sleep, and long chat rendering.
- Side-by-side diff viewer after unified diff is usable.
- Rich terminal emulation after basic scrollback/input/reconnect works.
- iOS App Store/TestFlight release after Android proves the architecture and a macOS signing path is available.
