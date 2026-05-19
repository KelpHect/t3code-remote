# T3 Code Mobile Production Readiness TODO

Last audit refresh: 2026-05-18

## Audit Scope

Inspected root project instructions and plans (`AGENTS.md`, `TODO.md`,
`plan_mobile.md`, `REMOTE.md`, `README.md`), root workspace scripts
(`package.json`, `turbo.json`, `bun.lock`), current app directories under
`apps/`, Android SDK/emulator availability, and the active mobile direction.
The active implementation target is `apps/mobile/`. The scaffold is normalized
as `@t3tools/mobile`, includes Capacitor Android under `apps/mobile/android/`,
and has clean mobile lint, typecheck, test, build, and Android sync baselines.
It still uses the generated Ionic tabs starter UI and has no T3 Code mobile
chat shell yet. Existing backend, web, desktop, and shared package code remain
out of scope for mobile support.

## P0 - Ionic Vue UI Bring-Up

Purpose: make the Ionic Vue app start with the desired mobile experience: clean,
chat-first, ChatGPT-like, and built from Ionic components before backend
protocol work. Risk: high because the failed native spike showed that a dense
desktop control panel is not acceptable on mobile. Scope guardrail: only
`apps/mobile/`, root workspace wiring needed for that app, and synchronized
docs.

### UI Direction And Ionic Component Contract

- [x] Replace the generated tabs starter with a chat-first Ionic shell.
      Evidence: the scaffold no longer routes through starter `Tab1Page`/
      `Tab2Page`/`Tab3Page` views.
      Acceptance: the default route opens a chat screen, not tabs; the app uses
      `IonApp`, `IonRouterOutlet`, `IonPage`, `IonHeader`, `IonContent`, and
      `IonFooter` as the top-level page structure; no desktop-width tab bar or
      button grid is visible on phone viewports.
- [x] Build the main chat screen with Ionic primitives first.
      Acceptance: chat uses `IonHeader`/`IonToolbar` for title, project/model
      affordances, and menu access; `IonContent` for a scrollable message list;
      `IonFooter` for a fixed composer; `IonTextarea`, `IonButton`, and
      `IonIcon` for input/send/stop actions; the composer stays reachable above
      the Android navigation bar and keyboard.
- [x] Build the navigation drawer with `IonMenu`.
      Acceptance: the drawer contains search, new chat, project groups, recent
      threads, settings, and connection status using `IonSearchbar`, `IonList`,
      `IonItem`, `IonLabel`, `IonBadge`, and `IonIcon`; it feels like ChatGPT
      history navigation while preserving T3 Code's project/thread grouping.
- [x] Build contextual tools as mobile sheets, modals, or action menus.
      Acceptance: model/mode picker, diff, git actions, files, terminal,
      approvals, and connection diagnostics open through `IonModal`,
      `IonActionSheet`, focused pages, or bottom-sheet style overlays; they do
      not appear as permanent dense tool panes on the default chat screen.
- [x] Build settings/connection as a clean Ionic list screen.
      Acceptance: backend discovery, manual URL, pairing token, private-network
      warning, diagnostics, theme, and app info use `IonList`, `IonItem`,
      `IonInput`, `IonTextarea`, `IonToggle`, `IonNote`, and `IonButton` with
      readable spacing and no clipped controls.
- [x] Theme through Ionic CSS variables and component parts.
      Acceptance: `src/theme/variables.css` defines light and dark palettes,
      safe-area-aware spacing, font, toolbar, content, item, modal, and composer
      variables; component overrides use Ionic CSS variables/shadow parts where
      possible instead of brittle DOM selectors.
- [x] Capture UI reference acceptance screenshots before backend work.
      Evidence: normal phone-sized emulator screenshots are stored under
      `apps/mobile/docs/screenshots/` for empty chat, populated chat, drawer
      history, settings/connection, model/mode sheet, action sheet, and
      terminal tool sheet.
      Acceptance: emulator screenshots for empty chat, populated chat, drawer
      history, settings/connection, model/mode sheet, and one tool sheet show no
      clipped text, overlapped controls, wide tabs, setup-first empty state, or
      desktop dashboard layout.
- [x] Keep an Ionic component reference note in `apps/mobile/README.md`.
      Evidence: `apps/mobile/README.md` includes an Ionic UI Contract section
      naming the page shell, drawer/history, composer, tool sheet/modal,
      settings/list, and theming components plus official Ionic Vue,
      navigation, component, CSS variable, and dark-mode references.
      Acceptance: README names the Ionic components used for page structure,
      drawer, sheets/modals, lists, composer, and theming, with links to the
      official Ionic Vue/navigation/components/theming docs.

### App Scaffold

- [x] Delete the old native mobile implementation directory.
      Evidence: the previous native mobile app directory no longer exists in
      the worktree.
- [x] Scaffold the Ionic Vue app at `apps/mobile/`.
      Evidence: `apps/mobile/package.json`, `index.html`, `src/`,
      `vite.config.ts`, `tsconfig.json`, `ionic.config.json`, and starter
      `Tab1Page`/`Tab2Page`/`Tab3Page` views exist.
- [x] Normalize the scaffold for this monorepo.
      Acceptance: package name is project-scoped, starter description is
      replaced, generated `node_modules` remains ignored/untracked, and
      scripts include `dev`, `build`, `preview`, `lint`, `typecheck`, `test`,
      `test:e2e`, and `cap:sync:android`.
- [x] Fix the scaffold lint baseline.
      Evidence: `bun --cwd apps/mobile lint` currently fails because ESLint
      cannot resolve `@typescript-eslint/eslint-plugin`.
      Acceptance: required ESLint dependencies/config are present and
      `bun --cwd apps/mobile lint` passes without new warnings in mobile files.
- [x] Fix the scaffold unit-test baseline.
      Evidence: `bun --cwd apps/mobile test:unit --run` currently fails in
      `tests/unit/example.spec.ts` while importing the starter `Tab1Page.vue`.
      Acceptance: the mobile test command is `bun --cwd apps/mobile test`, uses
      the app's Vitest config, and passes against the current starter or
      replacement shell.
- [x] Fix the scaffold build baseline.
      Evidence: `bun --cwd apps/mobile build` currently passes `vue-tsc` but
      Vite build fails because the starter legacy plugin emits unsupported
      `output.format: system`.
      Acceptance: Vite config is compatible with the repo toolchain and
      `bun --cwd apps/mobile build` passes.
- [x] Add Capacitor Android to `apps/mobile/`.
      Acceptance: Capacitor config exists, Android platform is generated under
      `apps/mobile/android/`, package id/display name are explicit, and
      `bun --cwd apps/mobile cap:sync:android` succeeds.
- [x] Wire `apps/mobile/` into the Bun workspace without changing
      existing web/server/desktop behavior.
      Acceptance: root `bun install` recognizes the workspace; root
      `bun typecheck`, `bun lint`, and `bun run test` still target existing
      packages successfully; mobile scripts can run independently.
- [x] Add `apps/mobile/README.md`.
      Acceptance: README documents setup, Android emulator run commands, backend
      boundary, private-network requirement, and validation commands.

## P1 - Backend Discovery And Pairing

Purpose: make the Ionic app find and pair with an unmodified running T3 desktop
backend. Risk: high because beta testing depends on finding the user's local
backend reliably. Scope guardrail: mobile app code only; do not add backend
endpoints or change existing auth behavior.

### Discovery

- [x] Implement backend candidate generation.
      Evidence: `apps/mobile/src/client/discovery.ts` generates emulator,
      desktop/browser, current-host LAN, and manual candidates with URL
      normalization and duplicate removal.
      Acceptance: Android emulator probes `http://10.0.2.2:3773` first;
      desktop/browser dev probes `http://127.0.0.1:3773` and
      `http://localhost:3773`; LAN/VPN probing is supported where platform APIs
      allow; manual URL entry is always available.
- [x] Implement `GET /api/auth/session` probe.
      Evidence: `probeBackendCandidate` calls `/api/auth/session`, accepts
      unauthenticated T3 auth JSON, and classifies timeout, connection-refused,
      invalid-response, cleartext-blocked, and unknown failures.
      Acceptance: any candidate returning T3 auth JSON is treated as a valid
      backend even when `authenticated` is false; failed probes are classified
      into timeout, connection refused, invalid response, blocked cleartext, or
      unknown error.
- [x] Surface discovery diagnostics in the UI.
      Evidence: chat, navigation drawer, connection tool sheet, and settings
      screen consume shared live discovery state with candidate counts, selected
      backend, probe rows, scan status, and rescan controls.
      Acceptance: connection screen shows candidate count, selected backend,
      probe status, and emulator guidance when no backend is found.
- [x] Add discovery tests.
      Evidence: `apps/mobile/tests/unit/discovery.spec.ts` covers URL
      normalization, emulator priority, duplicate removal, web defaults,
      unauthenticated T3 session detection, invalid responses, timeouts, and
      refused probes.
      Acceptance: tests cover emulator host priority, duplicate candidate
      removal, successful unauthenticated backend detection, timeout handling,
      and invalid-response rejection.

### Pairing

- [x] Implement bearer pairing through `POST /api/auth/bootstrap/bearer`.
      Evidence: `apps/mobile/src/client/auth.ts` resolves manual tokens and
      pairing URLs, posts to `/api/auth/bootstrap/bearer`, validates
      `sessionToken`, and the settings pairing form exchanges credentials into
      an in-memory bearer session without logging tokens.
      Acceptance: request accepts pairing token or URL, extracts token from URL
      fragments, decodes the existing `sessionToken` response field, and never
      logs credentials.
- [x] Implement short-lived ws-token issue through `POST /api/auth/ws-token`.
      Evidence: `apps/mobile/src/client/auth.ts` requests `/api/auth/ws-token`
      with `Authorization: Bearer <sessionToken>`, decodes the existing `token`
      response field, rejects malformed responses, and the settings pairing
      flow surfaces auth denial while clearing in-memory auth state.
      Acceptance: request sends bearer authorization, decodes the existing
      `token` response field, and surfaces auth denial clearly.
- [x] Store bearer tokens behind a mobile secure-storage adapter.
      Evidence: `apps/mobile/src/client/secretStore.ts` persists auth sessions
      through a `SecretStore` abstraction, Android registers the app-owned
      `T3SecureStorage` Capacitor plugin backed by Android Keystore encryption
      plus private `SharedPreferences`, settings saves/clears auth sessions
      through the adapter, and tests use memory storage without localStorage.
      Acceptance: production Android uses a Capacitor secure storage path;
      tests can use in-memory storage; plaintext localStorage is not used for
      production tokens.

## P2 - Existing `/ws` Compatibility

Purpose: consume the current backend WebSocket protocol from the Ionic app while
keeping private wire details isolated. Risk: high because the backend protocol is
not a public native API. Scope guardrail: app-owned TypeScript compatibility
code and tests only.

### Protocol

- [x] Capture redacted current `/ws` fixtures from an unmodified local backend.
      Evidence: `apps/mobile/src/client/ws/__fixtures__/current-backend.redacted.json`
      records the existing Effect RPC `/ws` envelope from the running
      unmodified desktop backend with tokens, home paths, workspace paths,
      repository remotes, ids, and message text redacted.
      Acceptance: fixtures cover auth, request/response, shell subscription,
      thread subscription, command dispatch, diffs, filesystem, git, terminal,
      cancellation, and errors; no tokens or private paths are present.
- [x] Implement TypeScript existing-`/ws` transport.
      Evidence: `apps/mobile/src/client/ws/effectRpcTransport.ts` implements
      the current Effect RPC `/ws` envelope with ws-token URL resolution,
      decimal request ids, request/response promises, streaming chunks, chunk
      acks, heartbeats, and stream interruption.
      Acceptance: transport connects with issued ws-token, sends request frames,
      resolves responses, streams subscription events, acks chunks if required,
      handles heartbeat, and cancels streams.
- [x] Add drift fixture tests.
      Evidence: `apps/mobile/tests/unit/wsFixtureDrift.spec.ts` validates the
      redacted current-backend `/ws` fixture and replays representative
      request/response, stream ack, and interrupt frames through the mobile
      transport.
      Acceptance: tests replay captured frames and fail with method/envelope
      names when current backend shapes change.
- [x] Keep private wire parsing out of Vue components and stores.
      Evidence: `apps/mobile/tests/unit/wsBoundary.spec.ts` scans mobile source
      files outside `src/client/ws/` and fails if they import the private
      Effect RPC transport or match private `_tag` wire envelopes directly.
      Acceptance: UI consumes app-owned DTOs only; lint or tests guard against
      importing transport internals into views.

## P3 - Mobile Client Reliability

Purpose: make the app usable over emulator host networking, LAN, and VPN where
sleep/background events are normal. Risk: high for trust. Scope guardrail:
client/state modules first; UI consumes state rather than owning transport.

### State

- [x] Implement reconnect loop with bounded backoff and visible connection
      states.
      Acceptance: states include connecting, connected, reconnecting, offline,
      auth required, and failed; delays are capped and testable.
      Evidence: `apps/mobile/src/client/ws/realtimeConnection.ts` owns
      token refresh, capped retry scheduling, stale-heartbeat checks, and
      offline/online recovery; `apps/mobile/src/client/connectionState.ts`
      exposes visible realtime states to the UI; `apps/mobile/tests/unit/realtimeConnection.spec.ts`
      covers auth-required, connected, failed retry, offline, and backoff caps.
- [x] Implement command outbox with client-generated command IDs.
      Acceptance: send/continue/stop commands persist before dispatch, replay
      after reconnect, and are removed only after success or explicit cancel.
      Evidence: `apps/mobile/src/client/commandOutbox.ts` generates
      `mobile-*` command IDs, persists queued commands before dispatch, retries
      failed commands, replays queued send/continue/stop intents, and removes
      commands only on success/cancel; `apps/mobile/tests/unit/commandOutbox.spec.ts`
      covers those paths.
- [ ] Implement sequence filtering for shell/thread events.
      Acceptance: stale or duplicate events do not regress project/thread/chat
      state.
- [ ] Keep composer drafts local per device.
      Acceptance: drafts survive screen navigation and app backgrounding but do
      not sync to the backend.

## P4 - Core T3 Workflows

Purpose: reach real beta usefulness against the existing backend. Risk: medium
to high because these surfaces touch user files, git, terminals, and agent
sessions. Scope guardrail: implement mobile UX and app-owned clients; do not
change backend behavior.

### Chat And Shell

- [ ] Subscribe to `orchestration.subscribeShell` and render real projects and
      threads.
      Acceptance: after pairing, projects/history replace fixture data and stay
      synchronized with desktop.
- [ ] Subscribe to `orchestration.subscribeThread` and render real chat turns,
      actions, approvals, and user-input prompts.
      Acceptance: selecting a thread opens current messages and live updates;
      long lists remain smooth.
- [ ] Implement send, continue, stop, and new thread/project chat flows.
      Acceptance: commands use client-generated command IDs and sync with
      desktop state.
- [ ] Wire model, runtime mode, and interaction mode controls.
      Acceptance: options come from backend-supported config where available and
      dispatch with chat commands.

### Tools

- [ ] Add unified diff viewer.
      Acceptance: loads turn/full-thread diffs, handles empty/binary states, and
      renders large patches without freezing.
- [ ] Add git status and action progress.
      Acceptance: refresh, commit, push, commit+push, and PR prep stream progress
      with clear high-impact action affordances.
- [ ] Add filesystem browse, project creation, and clone repository.
      Acceptance: browse desktop paths, create project records, clone repos, and
      report permission/clone failures without backend changes.
- [ ] Add terminal scrollback and input.
      Acceptance: open/write/resize/clear/restart/close work for selected
      thread/project; output is bounded or virtualized.

## P5 - Mobile Platform Hardening

Purpose: make Android safe enough for real device beta and prepare iOS later.
Risk: medium with security/release implications. Scope guardrail: Android first;
iOS remains deferred.

### Android

- [ ] Configure Capacitor Android package metadata.
      Acceptance: package id, display name, version name/code, app icon, and
      splash behavior are explicit.
- [ ] Restrict cleartext HTTP to paired private hosts.
      Acceptance: public cleartext URLs are blocked; emulator, loopback, LAN,
      VPN, and HTTPS paths behave predictably.
- [ ] Add Android permissions/network config needed for LAN/VPN discovery.
      Acceptance: manifest/config includes only required permissions, with
      user-visible rationale where Android requires it.
- [ ] Define debug/release Android artifact paths and signing strategy.
      Acceptance: README documents APK/AAB commands, signing env vars, artifact
      output paths, and what stays out of git.

### iOS

- [ ] Defer iOS until Android passes beta gate.
      Acceptance: iOS checklist names macOS/Xcode/signing prerequisites but no
      iOS implementation is started before Android proof.

## P6 - Validation And Release Baseline

Purpose: keep the new app verifiable without destabilizing the existing product.
Risk: medium because root checks still protect the monorepo. Scope guardrail:
validation may run existing checks; implementation stays mobile-only.

### Checks

- [ ] Establish mobile validation command set.
      Acceptance: `bun --cwd apps/mobile lint`, `typecheck`, `test`,
      `build`, and `cap:sync:android` pass after scaffold normalization.
- [ ] Run root validation after scaffold.
      Acceptance: `bun fmt`, `bun lint`, `bun typecheck`, and
      `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test` pass or
      document pre-existing unrelated warnings/failures.
- [ ] Add emulator install/launch/screenshot smoke script.
      Acceptance: one documented command builds/syncs/installs/launches and
      captures screenshots for the key mobile screens.

## Deferred / Future Work

- iOS build, signing, and TestFlight after Android proves UX and backend
  compatibility.
- Side-by-side diff viewer after unified diff is stable.
- Rich terminal emulation after basic scrollback/input works.
- Native desktop replacement work after the mobile app proves the Ionic client
  architecture.
