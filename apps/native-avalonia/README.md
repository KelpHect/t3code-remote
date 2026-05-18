# T3 Code Native

First-party native client spike for T3 Code.

This app is intentionally not a PWA, not Expo, and not a wrapper around `apps/web`. The desktop backend remains the only process running Codex app-server, git, filesystem access, terminals, and provider sessions. Native clients connect to that backend over a private LAN or VPN endpoint.

## Projects

- `T3Code.Native.Client`: HTTP auth bootstrap, native DTOs, `ClientWebSocket` transport, reconnect replay, subscription cancellation, sequence filtering, and the existing-backend `/ws` compatibility layer.
- Optional app-owned compatibility runtime: local helper service/runtime shipped inside this app if direct `/ws` handling is not enough for clean desktop parity.
- `T3Code.Native.App`: Avalonia MVVM app shell for pairing, project/thread/chat navigation, model/mode controls, and local composer state.
- `T3Code.Native.Tests`: protocol and client-state tests.

## Current Backend Boundary

The app targets the original unmodified T3 backend. Users must not need a T3 fork, modified T3 backend, new T3 backend endpoint, modified shared package, plugin, or separately installed adapter.

The app should discover reachable T3 backends on the private network and present candidates for pairing. Manual URL entry remains available for VPNs, emulator fallback, and networks where scanning is blocked.

The existing backend already exposes bearer pairing at `/api/auth/bootstrap/bearer`, short-lived WebSocket tokens at `/api/auth/ws-token`, and the current `/ws` backend protocol used by the web/desktop app. Native compatibility work belongs inside `T3Code.Native.Client`; UI/view models should consume app-owned DTOs and should not depend directly on private wire-format details.

Do not add or depend on `/api/native/descriptor`, `/native/ws`, new RPCs, backend forks, or separately installed adapter processes in the existing T3 codebase for native support. If the existing backend protocol is awkward, handle that in the native compatibility layer or in a bundled app-owned compatibility runtime under `apps/native-avalonia/`.

## Commands

```sh
dotnet test apps/native-avalonia/T3Code.Native.Tests/T3Code.Native.Tests.csproj
dotnet build apps/native-avalonia/T3Code.Native.App.Desktop/T3Code.Native.App.Desktop.csproj
```

For Android CLI work on this machine, source the shell setup first:

```sh
source ~/.zshrc
adb devices
emulator -list-avds
dotnet build apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj
dotnet publish apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj -c Debug
adb install -r apps/native-avalonia/T3Code.Native.App.Android/bin/Debug/net10.0-android/publish/codes.t3.nativeapp-Signed.apk
adb shell am start -n codes.t3.nativeapp/crc6420cdeeba6ca0b5da.MainActivity
mkdir -p apps/native-avalonia/artifacts
adb exec-out screencap -p > apps/native-avalonia/artifacts/android-emulator-pairing-screen.png
```

Expected local state: `ANDROID_HOME=/home/kellhect/Android/Sdk`, Android SDK tools on `PATH`, Java from `/usr/lib/jvm/java-17-temurin-jdk`, .NET `android` workload installed, and `MyAndroidAVD` visible.

The Android project embeds assemblies in the APK so the published debug APK can be installed with plain `adb install` without fast-deployment runtime state.

iOS is scaffolded but still requires a macOS/Xcode/signing validation path.
