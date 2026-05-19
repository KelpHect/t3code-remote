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

## Validation

Mobile gates:

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
