# T3 Code Mobile

Ionic Vue and Capacitor mobile client for T3 Code. The mobile app is a native
Capacitor app, not a PWA-only target and not a wrapper around `apps/web`.

## Backend Boundary

The app must work against an unmodified original T3 backend. Mobile support
belongs in `apps/mobile/`: discovery, pairing, existing `/ws` compatibility,
DTO mapping, reconnect, retry, persistence, and UI.

Do not require a server fork, plugin, modified backend, or separately installed
adapter. The desktop machine remains the owner of provider sessions, files, git,
terminals, and orchestration state.

Supported connection shape:

- Android emulator to local desktop backend: `http://10.0.2.2:3773`
- Desktop browser dev to local backend: `http://127.0.0.1:3773`
- Real device over LAN/VPN: paired private-network backend URL

Cleartext HTTP is allowed only for private endpoints: Android emulator host,
loopback, RFC1918 LAN ranges, CGNAT/VPN ranges, link-local, and `.local`
hostnames. Public HTTP backend URLs are rejected by the mobile client before
fetch or WebSocket connection; public remote access must use HTTPS.

The Android WebView is served through Capacitor's local `http://localhost`
scheme so private `http://` LAN/VPN/emulator requests are not blocked as mixed
content. Backend URL validation still rejects public cleartext hosts before any
request is made.

## Setup

From the repository root:

```sh
bun install
```

Run the app in a browser during UI work:

```sh
bun --cwd apps/mobile dev
```

Build and sync the Android project:

```sh
bun --cwd apps/mobile build
bun --cwd apps/mobile cap:sync:android
```

Android package metadata is explicit:

- Package id/application id: `codes.t3.mobile`
- Display name/activity title: `T3 Code`
- Version: `0.0.1` / Android `versionCode` `1`
- Launcher icon: Android resources under `android/app/src/main/res/mipmap-*`
- Splash: Android 12 splash style in `android/app/src/main/res/values/styles.xml`
  with the generated splash images under `android/app/src/main/res/drawable-*`

Android network permissions are intentionally narrow:

- Required permission: `android.permission.INTERNET`
- Not used: location, nearby devices, Bluetooth, Wi-Fi SSID, or notification
  permissions
- Rationale: current discovery probes explicit/generated HTTP(S) candidates over
  emulator host networking, LAN, or VPN. It does not inspect platform network
  metadata, so there is no runtime permission prompt to explain yet.

Android artifacts:

```sh
bun --cwd apps/mobile android:assemble:debug
bun --cwd apps/mobile android:assemble:release
bun --cwd apps/mobile android:bundle:release
```

- Debug APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
- Release AAB: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`

Emulator smoke:

```sh
bun --cwd apps/mobile android:smoke
```

The smoke command builds the debug APK, syncs Android, installs and launches
`codes.t3.mobile` on the first online emulator/device, and captures launch,
menu, actions, and composer screenshots under
`apps/mobile/docs/screenshots/smoke-*`.

Capacitor Android currently compiles Java 21 sources. The artifact scripts use
`JAVA_HOME` when set; otherwise they try Android Studio's bundled JBR via
`ANDROID_STUDIO_JBR` and common local Android Studio install paths.

Release signing is optional at build time and enabled only when every variable is
present:

```sh
export T3_MOBILE_ANDROID_KEYSTORE_PATH=/absolute/path/to/t3-code-mobile.jks
export T3_MOBILE_ANDROID_KEYSTORE_PASSWORD=...
export T3_MOBILE_ANDROID_KEY_ALIAS=...
export T3_MOBILE_ANDROID_KEY_PASSWORD=...
```

Keystores, `key.properties`, APKs, and AABs stay out of git.

iOS is deferred until Android passes the beta gate. The prerequisite checklist
lives in `docs/ios-deferred.md`; do not generate a Capacitor `ios/` platform
tree before that gate is met.

## Validation

Mobile gates:

```sh
bun --cwd apps/mobile validate
```

Expanded mobile gates:

```sh
bun --cwd apps/mobile lint
bun --cwd apps/mobile typecheck
bun --cwd apps/mobile test
bun --cwd apps/mobile build
bun --cwd apps/mobile cap:sync:android
```

Root gates:

```sh
bun fmt
bun lint
bun typecheck
TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test
```

Use `bun run test`, never `bun test`, for the root test suite.
The current warning baseline and latest validation evidence live in
`docs/validation.md`.

## Ionic UI Contract

Build the UI with Ionic Vue components first, then add targeted CSS through
Ionic variables and component parts.

Required component direction:

- Page shell: `IonApp`, `IonRouterOutlet`, `IonPage`, `IonHeader`,
  `IonToolbar`, `IonContent`, and `IonFooter`
- Navigation/history: `IonMenu`, `IonSearchbar`, `IonList`, `IonItem`,
  `IonLabel`, `IonBadge`, and `IonIcon`
- Chat composer: `IonTextarea`, `IonButton`, `IonIcon`, and safe-area-aware
  footer spacing
- Contextual tools: `IonModal`, `IonActionSheet`, focused pages, or
  bottom-sheet style overlays
- Settings/connection: `IonList`, `IonItem`, `IonInput`, `IonTextarea`,
  `IonToggle`, `IonNote`, and `IonButton`
- Theming: Ionic CSS variables in `src/theme/variables.css`

Official references:

- Ionic Vue: https://ionicframework.com/docs/vue/overview
- Ionic Vue navigation: https://ionicframework.com/docs/vue/navigation
- Ionic components: https://ionicframework.com/docs/components
- `ion-menu`: https://ionicframework.com/docs/api/menu
- `ion-modal`: https://ionicframework.com/docs/api/modal
- `ion-content`: https://ionicframework.com/docs/api/content
- CSS variables: https://ionicframework.com/docs/theming/css-variables
- Dark mode: https://ionicframework.com/docs/theming/dark-mode

The default screen must be chat-first. Do not ship the generated tabs starter,
wide desktop tab bars, dense tool grids, or setup-first dashboards as the mobile
experience.
