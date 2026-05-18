# Native Mobile Plan

Last updated: 2026-05-18

## Goal

Build a first-party native T3 Code client, not a PWA, not Expo, and not a wrapper around `apps/web`.

The desktop machine remains the only place running the T3 backend, Codex app-server, git, files, terminals, and provider sessions. The phone connects over a trusted private network such as WiFiman Teleport/WireGuard, Tailscale, or LAN.

Current implementation lives in `apps/native-avalonia/` and uses Avalonia 12 / .NET 10. Flutter remains the fallback if Avalonia fails the Android spike.

## Current Repository State

- `apps/native-avalonia/T3Code.Native.App.slnx` exists with app, desktop, Android, iOS, browser, client, and test projects.
- `T3Code.Native.Client` implements bearer pairing, ws-token issue, app-owned DTOs, WebSocket transport, reconnect replay, subscription cancellation, protocol errors, and sequence filtering.
- `T3Code.Native.App` implements an Avalonia MVVM pairing/chat-shell scaffold.
- `T3Code.Native.Tests` covers protocol encode/decode, reconnect replay, cancellation replay behavior, and sequence ordering.
- The existing backend exposes `/api/auth/bootstrap/bearer` and `/api/auth/ws-token`.
- Product decision: the mobile app must work with the original unmodified T3 backend. All native support work happens in the native app. The implementation targets behavior already available from the existing backend and must not require `/api/native/descriptor`, `/native/ws`, existing backend changes, shared package changes, or a T3 fork. The app may include a bundled app-owned compatibility runtime or local helper service if that is needed for flawless support.

## Local Android Setup Findings

Installed locally:

- .NET SDK: 10.0.107.
- Android SDK: `/home/kellhect/Android/Sdk`.
- Android platform installed: `android-36.1`.
- `adb`: `/home/kellhect/Android/Sdk/platform-tools/adb`.
- `emulator`: `/home/kellhect/Android/Sdk/emulator/emulator`.
- .NET Android workload: installed as `android` version `36.1.53/10.0.100`.
- Android command-line tools: installed under `/home/kellhect/Android/Sdk/cmdline-tools/latest/bin`.
- Android API 36 platform: `/home/kellhect/Android/Sdk/platforms/android-36/android.jar`.
- AVD: `MyAndroidAVD`.
- Running emulator observed: `emulator-5554 device`.
- Valid JDK for Android builds: `/usr/lib/jvm/java-17-temurin-jdk`.
- Shell setup: after `source ~/.zshrc` or `source ~/.bashrc`, `adb`, `emulator`, `java`, and `jar` resolve to the Android SDK/Temurin 17 paths needed by .NET Android.

Missing or not configured:

- Pairing against a real desktop backend is not validated yet.
- Non-interactive shells that do not source zsh/bash rc files may still see stale Android/Java paths; source the rc file before build checks.

Official setup references:

- Microsoft .NET for Android installation: `dotnet workload install android`, plus Android SDK dependencies.
- Avalonia Android guide: install the Android workload, configure Android SDK path, and use `AndroidSdkDirectory` if needed.
- Avalonia supported platforms: Android/iOS mobile targets require .NET 10; Android 16/API 36 is Tier 1 and Android 12-15/API 31-35 are Tier 2 as of the current docs.

## Required Local Setup

Use this shell setup before Android CLI work:

```sh
export ANDROID_HOME=/home/kellhect/Android/Sdk
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export JAVA_HOME=/usr/lib/jvm/java-17-temurin-jdk
export PATH="$JAVA_HOME/bin:$PATH"
```

The user's `~/.zshrc` and `~/.bashrc` have been updated with these paths. For non-interactive command checks, run `source ~/.zshrc` or `source ~/.bashrc` first.

Verify Android tools:

```sh
adb devices
emulator -list-avds
```

The .NET Android workload is installed. Reinstall or repair it only if `dotnet workload list` no longer shows `android`:

```sh
dotnet workload install android
```

If Fedora-packaged .NET cannot install workloads, use Microsoft's official .NET SDK or install script for .NET 10, then rerun the workload install.

`MyAndroidAVD` exists. To verify or recreate it, use Android Studio Device Manager, preferably with an Android 16/API 36 image for the Tier 1 Avalonia target. After creation:

```sh
emulator -list-avds
emulator -avd <name>
adb devices
```

The API platform mismatch is fixed because `/home/kellhect/Android/Sdk/platforms/android-36/android.jar` exists. If that platform disappears, reinstall it with SDK Manager or let .NET install dependencies:

```sh
dotnet build apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj \
  -t:InstallAndroidDependencies \
  -f net10.0-android
```

## Android Build And Run Commands

First build only:

```sh
dotnet build apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj
```

Publish a debug APK:

```sh
dotnet publish apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj \
  -c Debug
```

Install and launch after publish:

```sh
adb install -r apps/native-avalonia/T3Code.Native.App.Android/bin/Debug/net10.0-android/publish/codes.t3.nativeapp-Signed.apk
adb shell am start -n codes.t3.nativeapp/crc6420cdeeba6ca0b5da.MainActivity
```

Capture screenshot evidence:

```sh
mkdir -p apps/native-avalonia/artifacts
adb exec-out screencap -p > apps/native-avalonia/artifacts/android-emulator-pairing-screen.png
```

The emulator reaches the host machine through `http://10.0.2.2:<port>`. For the default T3 backend, try:

```text
http://10.0.2.2:3773
```

For a real phone over WiFiman Teleport/VPN, use the desktop's VPN/LAN address shown by T3 remote pairing.

## Stack Decision

Primary: Avalonia 12 / .NET 10.

Reasons:

- Aligns with the C# goal.
- Gives a possible path to a later native desktop client that talks to the existing backend.
- Shares native client logic across desktop and mobile.

Fallback: Flutter.

Switch to Flutter if Avalonia cannot pass the Android decision gate quickly:

- Pair to an existing desktop backend.
- Maintain a stable WebSocket through normal use.
- Reconnect after emulator sleep, app background/foreground, and VPN drop/rejoin.
- Render a long chat smoothly enough for real usage.
- Support mobile text input and scrolling without layout instability.

Backend compatibility work stays reusable if the client library boundary remains clean: app/UI state should consume app-owned DTOs, while the existing `/ws` wire format and any app-owned helper runtime stay isolated behind native compatibility interfaces.

## Backend Contract

Do not connect the phone directly to Codex app-server. T3's server must remain the broker for provider sessions, files, git, terminals, approvals, and orchestration state.

Existing endpoints used by the native app:

- `POST /api/auth/bootstrap/bearer`
- `POST /api/auth/ws-token`
- `GET /ws` with the issued `wsToken`, using the current backend WebSocket/RPC format

Current product rule:

- Do not require backend changes for native support.
- Do not require users to install a fork of T3.
- Do not modify existing backend, web, desktop, or shared package code for native support.
- Do not require a separately installed adapter, plugin, or custom backend outside our app.
- Implement all extra compatibility and processing work under `apps/native-avalonia/`.
- Allow a bundled app-owned compatibility runtime or local helper service if direct native `/ws` consumption is not enough.
- Keep all existing `/ws` private wire-format assumptions inside native compatibility code.

Compatibility scope:

- Pairing and ws-token issue through existing HTTP endpoints.
- Existing `/ws` connection setup and authentication.
- Existing request/response RPC calls.
- Existing subscription/event streams.
- Cancellation and reconnect behavior.
- Method-level mapping into native DTOs.
- Optional bundled app-owned helper runtime for protocol translation, local queuing, fixture capture/replay, or mobile-friendly state projection.
- Drift fixtures for current backend envelopes.

Initial native methods:

- `server.getConfig`
- `server.getSettings`
- `server.updateSettings`
- `server.refreshProviders`
- `orchestration.subscribeShell`
- `orchestration.subscribeThread`
- `orchestration.dispatchCommand`
- `orchestration.getTurnDiff`
- `orchestration.getFullThreadDiff`
- `filesystem.browse`
- `sourceControl.lookupRepository`
- `sourceControl.cloneRepository`
- `vcs.refreshStatus`
- `subscribeVcsStatus`
- `git.runStackedAction`
- `git.subscribeActionRuns`
- `terminal.open`
- `terminal.write`
- `terminal.resize`
- `terminal.clear`
- `terminal.restart`
- `terminal.close`
- `subscribeTerminalEvents`

## Compatibility Decision

The decision is made: support the original unmodified T3 backend first, even if it requires more native-side protocol code.

Implementation consequence:

- Start with a direct existing-`/ws` compatibility transport in the native app.
- Add a bundled app-owned compatibility runtime if direct transport becomes too brittle or cannot cover desktop parity cleanly.
- Add fixture-based tests so original-backend protocol drift is caught quickly.
- Keep compatibility code contained and keep UI/domain code independent of private wire details.
- Do not change existing backend, web, desktop, or shared package code for native support.

## Native App Shape

Current projects:

- `T3Code.Native.Client`: auth, protocol DTOs, WebSocket transport, reconnect/replay, cancellation, protocol errors, sequence filtering, and native compatibility interfaces.
- Optional `T3Code.Native.CompatibilityRuntime` or equivalent: app-owned local runtime/helper service for protocol translation or state projection when needed, still shipped inside `apps/native-avalonia/`.
- `T3Code.Native.App`: Avalonia MVVM UI shell.
- `T3Code.Native.Tests`: protocol and client-state tests.
- `T3Code.Native.App.Android`: Android packaging and cleartext/private-network config.
- `T3Code.Native.App.iOS`: iOS scaffold and local-network/ATS plist config.
- `T3Code.Native.App.Desktop`: local desktop runner for quick UI iteration.

Initial screens:

- Connection manager: enter backend URL, paste pairing URL/token, pair, save environment.
- Project/thread list: driven by `orchestration.subscribeShell`.
- Chat: continue existing chats, create new threads, send turns, stop session, answer approvals/user input.
- Model/mode controls: model selection, runtime mode, and interaction mode.
- Diffs: unified diff first, side-by-side later.
- Git: status, commit, push, commit+push, PR prep, progress logs.
- Files/projects: browse desktop filesystem, add project, clone repository.
- Terminal: scrollback plus input first; richer terminal emulation later.

## Sync Rules

- Backend remains the single source of truth.
- Native and desktop/web clients are peers.
- Submitted chats sync through orchestration snapshots/events.
- Use client-generated command IDs for retries.
- Apply snapshots/events only by increasing sequence.
- Keep unsent composer drafts local per device.

## VPN And Cleartext Rules

- WiFiman Teleport/WireGuard and Tailscale are treated as private-network transports.
- Android cleartext HTTP is allowed only for manually paired private hosts.
- iOS local networking requires ATS/local-network configuration.
- The app must show clear VPN/private-network framing before connecting to HTTP endpoints.
- Bearer tokens must move from `MemorySecretStore` to platform secure storage before production.
- Revocation must use existing T3 auth controls where possible.

## Implementation Order

1. Build and launch the Android Avalonia shell.
2. Pair over emulator host networking against the existing desktop backend auth endpoints.
3. Capture existing `/ws` protocol fixtures from an unmodified local backend.
4. Implement the existing-`/ws` compatibility transport inside `T3Code.Native.Client`.
5. Subscribe to shell state and prove synchronized project/thread state using only native app code.
6. If direct `/ws` handling cannot provide clean parity, add a bundled app-owned compatibility runtime under `apps/native-avalonia/`.
7. Implement chat read/send/continue/stop, including command IDs and retry behavior.
8. Implement model picker, runtime mode, and interaction mode against backend-supported options.
9. Add diff viewer and git action UX.
10. Add filesystem browse, project create/clone, and terminal.
11. Run Android VPN/sleep/reconnect and long-chat performance tests.
12. Start iOS build/test only after Android passes the architecture gate.
13. Start native desktop client work only within the same app-only boundary: connect to the existing backend, reuse the native compatibility client/runtime, and migrate UI feature-by-feature without changing existing backend/web/desktop code.

## Acceptance Tests

Root repository:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`

Native desktop/client:

- `dotnet test apps/native-avalonia/T3Code.Native.Tests/T3Code.Native.Tests.csproj`
- `dotnet build apps/native-avalonia/T3Code.Native.App.Desktop/T3Code.Native.App.Desktop.csproj`

Android:

- `dotnet workload list` shows `android`.
- `emulator -list-avds` prints `MyAndroidAVD` or another named AVD.
- `adb devices` shows an emulator or physical device.
- `dotnet build apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj` succeeds after sourcing zsh/bash rc files.
- Android app builds, installs, launches, stays focused, and has screenshot evidence at `apps/native-avalonia/artifacts/android-emulator-pairing-screen.png`.
- Pairing succeeds against a local desktop backend.
- Manual mobile test continues an existing thread, starts a new project chat, changes model/mode, views edits, commits, pushes, loses/rejoins VPN, and returns to the same synchronized state.

Existing `/ws` compatibility tests:

- Auth success and denial.
- Request/response.
- Subscriptions.
- Cancellation.
- Reconnect.
- Malformed messages.
- Expired `wsToken`.
- Duplicate command retry.
- Fixture replay and drift detection for current backend envelopes.
- App-owned compatibility runtime translation if that runtime is added.

Native client tests:

- JSON encode/decode.
- Reconnect.
- Command outbox replay.
- Stream cancellation.
- Sequence ordering.
- Token refresh.
- Secure store save/load/clear.

## Open Risks

- The current native app can pair but cannot stream orchestration until the existing `/ws` compatibility transport is implemented.
- Original backend wire-format changes can break native compatibility; fixture replay tests and a narrow compatibility layer are required.
- Avalonia mobile support is improving but less proven than Flutter for mobile polish.
- Pairing against a real local backend from the emulator is still pending.
- iOS cannot be validated from this Linux environment without a macOS/Xcode/signing path.
- Cleartext HTTP is acceptable only for paired private-network use and must not become a broad insecure browser.
