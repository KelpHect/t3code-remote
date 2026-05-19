# T3 Code Mobile Production Readiness TODO

Last audit refresh: 2026-05-19

## Audit Scope

Inspected root project instructions and plans (`AGENTS.md`, `TODO.md`,
`plan_mobile.md`, `REMOTE.md`, `README.md`), root workspace scripts
(`package.json`, `turbo.json`, `bun.lock`), current app directories under
`apps/`, Android SDK/emulator availability, and the active mobile direction.
The active implementation target is `apps/mobile/`. The scaffold is normalized
as `@t3tools/mobile`, includes Capacitor Android under `apps/mobile/android/`,
has a chat-first Ionic Vue shell, talks to an unmodified local T3 backend
through app-owned discovery/pairing/existing-`/ws` compatibility code, and has
clean mobile lint, typecheck, test, build, Android sync, Android install/launch,
and root validation baselines. Existing backend, web, desktop, and shared
package code remain out of scope for mobile support.

## Production Readiness Verdict

Android is not production ready yet. The app is currently an Android beta
candidate / engineering preview: core workflows are implemented, but production
readiness still needs real-device LAN/VPN validation, mobile-appropriate desktop
workflow parity, hardening for long sessions and backgrounding, release signing,
privacy/security review, and release-runbook proof.

Desktop-only expectations such as global keyboard shortcuts, multi-window
desktop layout, and Electron-specific command palettes are intentionally not
mobile production blockers. Mobile parity means the same user jobs are possible
through touch-first screens, sheets, menus, and lifecycle-safe state.

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
- [x] Implement sequence filtering for shell/thread events.
      Acceptance: stale or duplicate events do not regress project/thread/chat
      state.
      Evidence: `apps/mobile/src/client/sequenceFilter.ts` tracks increasing
      `sequence`/`snapshotSequence` values per shell/thread scope and ignores
      stale, duplicate, or malformed updates; `apps/mobile/tests/unit/sequenceFilter.spec.ts`
      verifies shell events, thread snapshots, independent scopes, and malformed
      updates.
- [x] Keep composer drafts local per device.
      Acceptance: drafts survive screen navigation and app backgrounding but do
      not sync to the backend.
      Evidence: `apps/mobile/src/client/composerDrafts.ts` stores drafts in
      app-local browser/device storage keyed by backend/project/thread, the chat
      composer loads/saves through that app-owned store and flushes on
      visibility/page lifecycle events, and
      `apps/mobile/tests/unit/composerDrafts.spec.ts` covers persistence,
      per-backend/thread isolation, blank-draft removal, and malformed storage.

## P4 - Core T3 Workflows

Purpose: reach real beta usefulness against the existing backend. Risk: medium
to high because these surfaces touch user files, git, terminals, and agent
sessions. Scope guardrail: implement mobile UX and app-owned clients; do not
change backend behavior.

### Chat And Shell

- [x] Subscribe to `orchestration.subscribeShell` and render real projects and
      threads.
      Acceptance: after pairing, projects/history replace fixture data and stay
      synchronized with desktop.
      Evidence: `apps/mobile/src/client/ws/existingBackendClient.ts` wraps the
      existing `/ws` transport inside the private compatibility boundary,
      `apps/mobile/src/client/mobileShell.ts` subscribes to
      `orchestration.subscribeShell`, maps snapshots/events into app-owned
      project/thread DTOs, filters stale sequences, and reconnects on sync
      failure, `apps/mobile/src/App.vue` renders real project/thread groups in
      the drawer, `apps/mobile/src/views/ChatPage.vue` reflects the selected
      project/thread, and `apps/mobile/tests/unit/mobileShell.spec.ts` covers
      snapshot mapping, upserts, removals, ordering, and stale-event rejection.
- [x] Subscribe to `orchestration.subscribeThread` and render real chat turns,
      actions, approvals, and user-input prompts.
      Acceptance: selecting a thread opens current messages and live updates;
      long lists remain smooth.
      Evidence: `apps/mobile/src/client/ws/existingBackendClient.ts` now wraps
      `orchestration.subscribeThread`, `apps/mobile/src/client/mobileThread.ts`
      maps thread snapshots/events into app-owned message, action, session,
      proposed-plan, approval, and user-input DTOs with sequence rejection,
      reconnect, and bounded rendered lists, `apps/mobile/src/views/ChatPage.vue`
      starts/stops selected-thread sync and renders real messages, actions, and
      prompt cards, and `apps/mobile/tests/unit/mobileThread.spec.ts` covers
      snapshot mapping, live events, stale/other-thread rejection, and pending
      prompt derivation.
- [x] Implement send, continue, stop, and new thread/project chat flows.
      Acceptance: commands use client-generated command IDs and sync with
      desktop state.
      Evidence: `apps/mobile/src/client/mobileChatCommands.ts` builds existing
      backend `thread.turn.start` and `thread.turn.interrupt` payloads,
      including mobile-generated message/thread IDs and bootstrap metadata for
      new-thread starts under the selected project,
      `apps/mobile/src/client/ws/existingBackendClient.ts` dispatches commands
      through the existing `/ws` `orchestration.dispatchCommand` method,
      `apps/mobile/src/views/ChatPage.vue` wires send, continue, stop, and
      new-chat composer paths through the persistent mobile command outbox, and
      `apps/mobile/tests/unit/mobileChatCommands.spec.ts` plus existing outbox
      tests cover payloads, generated IDs, bootstrap metadata, interrupt
      payloads, and reconnect replay semantics.
- [x] Wire model, runtime mode, and interaction mode controls.
      Acceptance: options come from backend-supported config where available and
      dispatch with chat commands.
      Evidence: `apps/mobile/src/client/mobileModelControls.ts` loads
      `server.getConfig`/`server.refreshProviders` through the existing `/ws`
      compatibility client, maps backend provider/model snapshots into
      app-owned choices, normalizes runtime/interaction modes, and falls back to
      the current thread/project model when provider config is unavailable.
      `apps/mobile/src/client/mobileChatCommands.ts` builds
      `thread.meta.update`, `thread.runtime-mode.set`, and
      `thread.interaction-mode.set` payloads, `apps/mobile/src/views/ChatPage.vue`
      replaces the placeholder sheet with real model/runtime/interaction
      controls that dispatch existing-thread settings through the persistent
      outbox and apply draft settings to new turns, and unit tests cover provider
      mapping, mode normalization, selection comparison, and settings payloads.

### Tools

- [x] Add unified diff viewer.
      Acceptance: loads turn/full-thread diffs, handles empty/binary states, and
      renders large patches without freezing.
      Evidence: `apps/mobile/src/client/ws/existingBackendClient.ts` now exposes
      `orchestration.getTurnDiff` and `orchestration.getFullThreadDiff`,
      `apps/mobile/src/client/mobileThread.ts` maps checkpoint/turn-diff
      summaries from thread snapshots and live `thread.turn-diff-completed`
      events, `apps/mobile/src/client/mobileDiff.ts` loads full-thread and
      latest-turn diffs, supports current `diff` string and legacy file-only
      result shapes, detects empty/binary patches, parses changed file stats,
      and bounds large patch rendering, and `apps/mobile/src/views/ChatPage.vue`
      replaces the static diff placeholder with a real unified diff sheet,
      changed-file list, whitespace toggle, loading/error/empty states, and
      latest/full controls. Unit tests cover diff parsing, large-patch bounding,
      legacy result mapping, and live checkpoint summary updates.
- [x] Add git status and action progress.
      Acceptance: refresh, commit, push, commit+push, and PR prep stream progress
      with clear high-impact action affordances.
      Evidence: `apps/mobile/src/client/ws/existingBackendClient.ts` wraps the
      existing `vcs.refreshStatus`, `subscribeVcsStatus`, and
      `git.runStackedAction` `/ws` methods inside the mobile compatibility
      boundary, `apps/mobile/src/client/mobileGit.ts` maps current and legacy
      git status shapes, reduces live status events, runs stacked git actions,
      and converts action progress chunks into bounded mobile log entries, and
      `apps/mobile/src/views/ChatPage.vue` replaces the static git placeholder
      with real repository status, changed-file rows, commit message input,
      refresh/commit/push/commit+push/PR action buttons, streamed progress, and
      error/empty states. Unit tests cover status mapping, stream reduction, and
      progress mapping.
- [x] Add filesystem browse, project creation, and clone repository.
      Acceptance: browse desktop paths, create project records, clone repos, and
      report permission/clone failures without backend changes.
      Evidence: `apps/mobile/src/client/ws/existingBackendClient.ts` wraps
      existing `filesystem.browse`, `sourceControl.lookupRepository`, and
      `sourceControl.cloneRepository` methods, `apps/mobile/src/client/mobileFiles.ts`
      maps browse, repository lookup, clone results, remote URL detection, and
      project title inference inside app-owned DTOs, `apps/mobile/src/client/mobileChatCommands.ts`
      builds existing `project.create` orchestration payloads with mobile project
      IDs, and `apps/mobile/src/views/ChatPage.vue` replaces the Files
      placeholder with path browsing, add-project, repository lookup, clone+add,
      and permission/clone error states. Unit tests cover browse/result mapping,
      clone mapping, URL detection, title inference, and project-create payloads.
- [x] Add terminal scrollback and input.
      Acceptance: open/write/resize/clear/restart/close work for selected
      thread/project; output is bounded or virtualized.
      Evidence: `apps/mobile/src/client/ws/existingBackendClient.ts` wraps
      existing `terminal.open`, `terminal.write`, `terminal.resize`,
      `terminal.clear`, `terminal.restart`, `terminal.close`, and
      `subscribeTerminalEvents`, `apps/mobile/src/client/mobileTerminal.ts`
      maps snapshots/events, filters subscription events by selected
      thread/default terminal, and bounds scrollback to 80k characters, and
      `apps/mobile/src/views/ChatPage.vue` replaces the terminal placeholder
      with open/clear/restart/close controls, streamed scrollback, input send,
      resize-on-subscribe, and error states. Unit tests cover snapshot/event
      mapping, reducer behavior, and scrollback bounding.

## P5 - Mobile Platform Hardening

Purpose: make Android safe enough for real device beta and prepare iOS later.
Risk: medium with security/release implications. Scope guardrail: Android first;
iOS remains deferred.

### Android

- [x] Configure Capacitor Android package metadata.
      Acceptance: package id, display name, version name/code, app icon, and
      splash behavior are explicit.
      Evidence: `apps/mobile/capacitor.config.ts` sets package id
      `codes.t3.mobile` and display name `T3 Code`,
      `apps/mobile/android/app/build.gradle` pins application id, version name
      `0.0.1`, and version code `1`, Android string resources name the app and
      activity, launcher icons are generated under `android/app/src/main/res/mipmap-*`,
      splash resources live under `android/app/src/main/res/drawable-*`, and
      `apps/mobile/android/app/src/main/res/values/styles.xml` explicitly
      configures the Android launch splash theme. `apps/mobile/README.md`
      documents the metadata surface.
- [x] Restrict cleartext HTTP to paired private hosts.
      Acceptance: public cleartext URLs are blocked; emulator, loopback, LAN,
      VPN, and HTTPS paths behave predictably.
      Evidence: `apps/mobile/src/client/discovery.ts` now rejects public
      cleartext backend URLs during normalization/probing while allowing HTTPS,
      Android emulator host, loopback, RFC1918 LAN, CGNAT/VPN, link-local, and
      `.local` hosts. Existing auth and `/ws` client creation already flow
      through `normalizeBackendUrl`, so blocked public HTTP cannot pair or open
      sockets. `apps/mobile/android/app/src/main/res/xml/network_security_config.xml`
      permits Android cleartext at the platform layer because Android cannot
      express private CIDR ranges in XML, with app-owned URL validation as the
      restriction boundary. Unit tests cover public HTTP rejection and private
      host classification.
- [x] Add Android permissions/network config needed for LAN/VPN discovery.
      Acceptance: manifest/config includes only required permissions, with
      user-visible rationale where Android requires it.
      Evidence: `apps/mobile/android/app/src/main/AndroidManifest.xml` declares
      only `android.permission.INTERNET` for HTTP/WebSocket probing over
      emulator host networking, LAN, and VPN. The manifest comment and
      `apps/mobile/README.md` explain that location, nearby-device, Bluetooth,
      Wi-Fi SSID, and notification permissions are intentionally absent because
      current discovery does not read platform network metadata or require a
      runtime permission prompt.
- [x] Define debug/release Android artifact paths and signing strategy.
      Acceptance: README documents APK/AAB commands, signing env vars, artifact
      output paths, and what stays out of git.
      Evidence: `apps/mobile/package.json` now exposes debug APK, release APK,
      and release AAB Gradle wrapper scripts. `apps/mobile/android/app/build.gradle`
      enables release signing only when all `T3_MOBILE_ANDROID_*` keystore
      environment variables are present, so normal debug validation stays
      unsigned and deterministic. `apps/mobile/android/.gitignore` excludes APKs,
      AABs, keystores, and `key.properties`, and `apps/mobile/README.md`
      documents commands, artifact paths, signing variables, and secret
      boundaries.

### iOS

- [x] Defer iOS until Android passes beta gate.
      Acceptance: iOS checklist names macOS/Xcode/signing prerequisites but no
      iOS implementation is started before Android proof.
      Evidence: `apps/mobile/docs/ios-deferred.md` states that iOS is blocked
      until Android beta validation passes, names macOS/Xcode, Apple Developer
      signing, bundle id, ATS/local-network, Keychain, simulator/device, and
      TestFlight prerequisites, and records that no Capacitor `ios/` platform
      tree should be generated before the Android proof. `apps/mobile/README.md`
      links the deferral checklist.

## P6 - Validation And Release Baseline

Purpose: keep the new app verifiable without destabilizing the existing product.
Risk: medium because root checks still protect the monorepo. Scope guardrail:
validation may run existing checks; implementation stays mobile-only.

### Checks

- [x] Establish mobile validation command set.
      Acceptance: `bun --cwd apps/mobile lint`, `typecheck`, `test`,
      `build`, and `cap:sync:android` pass after scaffold normalization.
      Evidence: `apps/mobile/package.json` exposes
      `bun --cwd apps/mobile validate`, and `apps/mobile/README.md` documents
      both the wrapper and expanded mobile gates. Verified with
      `bun --cwd apps/mobile validate`.
- [x] Run root validation after scaffold.
      Acceptance: `bun fmt`, `bun lint`, `bun typecheck`, and
      `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test` pass or
      document pre-existing unrelated warnings/failures.
      Evidence: `apps/mobile/docs/validation.md` records the current root and
      mobile gate baseline, including the known 9 existing web/client lint
      warnings, Ionic/lightningcss build warnings, and latest passing root test
      counts. Verified with `bun fmt`, `bun lint`, `bun typecheck`, and
      `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`.
- [x] Add emulator install/launch/screenshot smoke script.
      Acceptance: one documented command builds/syncs/installs/launches and
      captures screenshots for the key mobile screens.
      Evidence: `apps/mobile/package.json` exposes
      `bun --cwd apps/mobile android:smoke`. The script builds the debug APK,
      syncs Android, installs and launches `codes.t3.mobile` on the selected
      emulator/device, and captures launch, menu, actions, and composer
      screenshots under `apps/mobile/docs/screenshots/smoke-*`. Generated
      screenshots are ignored by git. Verified on `emulator-5554` with
      screenshots in `apps/mobile/docs/screenshots/smoke-20260519-130828`.

## P7 - Android Beta Proof

Purpose: prove the current implementation works against a real unmodified T3
desktop backend in the conditions users will actually use: emulator, physical
Android device, LAN, VPN, background/resume, and concurrent desktop/mobile use.
Risk: high because code-level tests do not prove private-network reliability or
desktop/mobile state parity. Scope guardrail: implementation remains in
`apps/mobile/`; do not change the existing backend/web/desktop/shared code.

### Manual Device And Network Proof

- [ ] Run and document the Android emulator beta script against a live local T3
      backend.
      Acceptance: a dated report under `apps/mobile/docs/qa/` records emulator
      discovery of `http://10.0.2.2:3773`, pairing, shell subscription, opening
      an existing thread, sending a turn, stopping/continuing a turn, viewing a
      diff, git status, files, and terminal output; screenshots or redacted logs
      prove each step.
- [ ] Run and document a physical Android LAN/VPN beta pass.
      Acceptance: a phone on the same LAN and a phone over VPN/Teleport can
      discover or manually connect to the desktop backend, pair, continue an
      existing GPT-5.5 thread, start a new project chat, change model/mode, view
      edits, commit/push, lose/rejoin network, and return to the same
      synchronized state.
- [ ] Prove desktop and mobile clients behave as peers.
      Acceptance: while Electron/web desktop is open, mobile-created chats,
      desktop-created chats, thread status changes, action progress, git state,
      terminal state, and model/mode changes converge without duplicate turns,
      stale state regressions, or lost composer drafts.
- [ ] Harden backend discovery for real private networks.
      Acceptance: discovery clearly distinguishes "backend not running",
      "backend bound only to loopback", "backend reachable but unauthenticated",
      "cleartext blocked", and "VPN/LAN unreachable"; emulator localhost
      fallback is not the only reliable path; manual URL fallback remains
      obvious and tested.
- [ ] Add Android lifecycle proof for background/resume and sleep.
      Acceptance: backgrounding the app, locking the phone, waking it, changing
      networks, and returning to foreground triggers token refresh/reconnect
      without duplicate subscriptions, lost outbox commands, or corrupted local
      drafts.

### Beta Gates

- [ ] Create a mobile beta QA checklist.
      Acceptance: `apps/mobile/docs/qa/android-beta-checklist.md` names every
      workflow to verify before sharing a beta APK, including discovery,
      pairing, chat, approvals/user input, model/mode, diffs, git, files,
      terminal, reconnect, backgrounding, and private-network warnings.
- [ ] Add failure-triage capture for beta runs.
      Acceptance: the app can export or display redacted diagnostics containing
      app version, backend URL host only, connection state, last discovery
      results, active thread/project ids, and recent non-secret errors without
      leaking bearer tokens, ws tokens, pairing tokens, prompts, private paths,
      or repository remotes.

## P8 - Android Production Release Hardening

Purpose: make the Android app safe to distribute outside this development
machine. Risk: high because release signing, backup behavior, privacy posture,
and artifact repeatability are production-facing. Scope guardrail: Android
release work stays under `apps/mobile/` and mobile docs.

### Release Artifacts

- [ ] Validate signed release APK and AAB generation.
      Acceptance: using documented `T3_MOBILE_ANDROID_*` signing variables,
      `bun --cwd apps/mobile android:assemble:release` and
      `bun --cwd apps/mobile android:bundle:release` produce signed artifacts;
      `apksigner verify` or the Android build output confirms signing; no
      keystore material or `key.properties` is tracked.
- [ ] Define Android versioning and release channels.
      Acceptance: docs state how `versionName`, `versionCode`, package id, and
      changelog entries advance for internal beta, release candidate, and
      production builds; no release can reuse a published `versionCode`.
- [ ] Add a release smoke checklist for generated APK/AAB artifacts.
      Acceptance: the checklist installs the exact built artifact on a clean
      emulator/device, verifies first-run pairing, secure token persistence,
      reconnect after force stop, and no debug/dev-only labels or mock fixtures.
- [ ] Produce a concise Android release runbook.
      Acceptance: `apps/mobile/docs/android-release.md` covers prerequisites,
      signing env vars, build commands, artifact paths, smoke test command,
      known baseline warnings, rollback guidance, and what evidence to attach
      to a release.

### Android Privacy And Platform Policy

- [ ] Review Android backup behavior for secrets.
      Acceptance: `android:allowBackup` is either disabled or configured with
      explicit backup rules that exclude all token/session storage; tests or
      docs explain why Android Keystore-backed secrets cannot be restored
      unsafely.
- [ ] Add Android privacy/data-safety notes.
      Acceptance: docs identify data processed by the app: backend URL,
      bearer/ws tokens, local drafts, project/thread metadata, prompts, git
      status, file paths, terminal output, and diagnostics; notes explain what
      remains on device, what stays on the desktop backend, and what must never
      be logged.
- [ ] Confirm production app metadata.
      Acceptance: app label, icon, splash, package id, version, theme, network
      config, and permission list are reviewed against the intended beta/release
      build; no generated Ionic starter branding remains.

## P9 - Mobile Workflow Parity

Purpose: close feature gaps where the mobile app should perform the same user
jobs as desktop, using mobile-native interaction patterns instead of desktop
keyboard/windowing conventions. Risk: high because "looks usable" is not the
same as "can replace desktop for remote work." Scope guardrail: parity is
touch-first and mobile-appropriate; do not add desktop-only keyboard workflows.

### Chat, Approvals, And Agent Control

- [ ] Validate and harden approvals/user-input flows.
      Acceptance: pending approvals and user-input prompts from the backend
      render clearly, can be answered/denied from mobile, survive reconnect,
      and sync back to desktop without duplicate or stale prompts.
- [ ] Add complete turn control states.
      Acceptance: send, continue, stop, retry-after-failure, and disabled states
      reflect backend activity accurately; the composer cannot send invalid
      duplicate commands during reconnect or active stop.
- [ ] Add attachment and context parity audit.
      Acceptance: every desktop-supported chat input feature is classified as
      implemented, intentionally mobile-deferred, or blocked by existing
      backend behavior; active gaps become narrow TODO items instead of broad
      parity claims.
- [ ] Persist and restore per-thread mobile UI state.
      Acceptance: selected model/mode, active tool sheet, local draft, selected
      diff scope, file browser path, git commit message draft, and terminal
      input state restore after navigation/backgrounding where doing so is safe.

### Model, Runtime, And Interaction Modes

- [ ] Manually validate model/mode selection across providers.
      Acceptance: provider refresh, unavailable providers, disabled providers,
      provider-specific options, model fallback, runtime mode changes, and
      interaction mode changes are tested against a live backend and documented
      with redacted evidence.
- [ ] Harden model/mode error handling.
      Acceptance: provider refresh failures, auth failures, unsupported modes,
      stale thread selection, and backend rejection produce clear mobile errors
      and do not leave the UI showing a selection that failed to persist.
- [ ] Confirm settings apply to the correct scope.
      Acceptance: existing-thread model/runtime/interaction updates affect that
      thread only; new-chat settings apply to the created thread; desktop-side
      changes are reflected on mobile after the next shell/thread event.

### Diffs, Git, Files, And Projects

- [ ] Complete diff viewer production UX.
      Acceptance: large diffs remain smooth, binary files and deleted/renamed
      files are obvious, latest-turn vs full-thread scope is clear, and copy/open
      affordances do not expose private paths accidentally in screenshots.
- [ ] Add high-impact git action confirmations.
      Acceptance: commit, push, commit+push, and PR prep show repository,
      branch, changed-file count, commit message, and consequence text before
      dispatch; cancellation/error states are explicit.
- [ ] Validate git action progress against live long-running operations.
      Acceptance: commit/push failures, auth failures, rejected pushes, and PR
      prep output stream into bounded logs without freezing or silently
      truncating the actionable error.
- [ ] Harden file navigation and project creation.
      Acceptance: permission errors, huge directories, symlink loops, hidden
      files, clone failures, invalid remotes, and duplicate project names are
      handled with clear mobile states and tests.

### Terminal

- [ ] Upgrade terminal from basic scrollback/input to a mobile terminal surface.
      Acceptance: ANSI colors/control sequences, prompt redraws, command output,
      paste, command history, Ctrl-C/Ctrl-D equivalents, resize, clear, restart,
      close, and reconnect are usable from touch controls. Full desktop keyboard
      shortcut parity is explicitly out of scope.
- [ ] Preserve terminal sessions across reconnects.
      Acceptance: if the backend terminal remains alive, mobile reconnect
      resubscribes without duplicate output; if it exited, mobile shows the
      exit state and restart path; closing the sheet does not unintentionally
      kill a running backend terminal.
- [ ] Add terminal safety and readability controls.
      Acceptance: terminal output is bounded/virtualized, long lines wrap or
      scroll predictably, secrets are not captured in diagnostics, and high-risk
      interrupt/close actions are deliberate.

## P10 - Performance And Scale

Purpose: keep the mobile app smooth under real T3 workloads: long chats, large
diffs, streaming tool output, and terminal logs. Risk: high because mobile
devices have tighter memory, CPU, and battery limits than desktop. Scope
guardrail: optimize app-owned rendering and state; do not change backend
protocols.

### Rendering And Memory

- [ ] Virtualize long chat rendering.
      Acceptance: a thread with thousands of messages/actions can scroll,
      receive live updates, and preserve scroll position without frame drops or
      unbounded DOM growth.
- [ ] Virtualize or incrementally render large diffs.
      Acceptance: large patch files and full-thread diffs load progressively or
      with bounded rendering, expose truncation clearly, and avoid blocking the
      main thread.
- [ ] Virtualize terminal output.
      Acceptance: terminal output far beyond the current 80k-character bound
      remains usable through a line/window model, with clear truncation and no
      runaway memory growth.
- [ ] Add performance regression fixtures.
      Acceptance: tests or scripts generate representative long-thread,
      large-diff, git-log, and terminal-output fixtures and assert render/state
      reducers stay bounded.

### Network And Battery

- [ ] Audit reconnect and heartbeat behavior for battery/network cost.
      Acceptance: background state reduces unnecessary work, foreground resumes
      promptly, retry backoff is capped, and tests cover online/offline flapping
      without request storms.
- [ ] Add slow/flaky network test coverage.
      Acceptance: simulated timeouts, partial streams, delayed ws-token issue,
      dropped subscriptions, and outbox replay are covered by unit or integration
      tests with deterministic timers.

## P11 - Security, Privacy, And Safety

Purpose: protect local T3 credentials, private project data, git/file/terminal
actions, and private-network assumptions. Risk: high because the app controls a
desktop machine over the network. Scope guardrail: enforce safety in the mobile
app and docs; do not weaken backend auth.

### Credentials And Secrets

- [ ] Verify Android secure storage on device.
      Acceptance: bearer tokens survive app restart through the secure store,
      are cleared on sign out/revoke, are not present in localStorage, logs, or
      screenshot fixtures, and cannot be restored through unsafe Android backup.
- [ ] Add token/session revocation UX.
      Acceptance: the app exposes a clear disconnect/sign-out flow that removes
      local tokens, closes sockets/subscriptions, clears queued commands, and
      explains that server-side revocation remains controlled by existing T3
      auth controls.
- [ ] Add secret-redaction tests for diagnostics and fixtures.
      Acceptance: pairing tokens, bearer tokens, ws tokens, private paths,
      repository remotes, prompts, terminal output, and user identifiers are
      redacted from exported diagnostics and committed fixtures.

### High-Impact Actions

- [ ] Add safety review for terminal/files/git actions.
      Acceptance: every mobile entry point that can modify files, run terminal
      commands, clone repositories, commit, push, or prepare PRs has an explicit
      confirmation, permission boundary, or existing backend approval path
      documented and tested.
- [ ] Harden malformed backend data handling.
      Acceptance: malformed `/ws` frames, unexpected DTO shapes, stale sequence
      numbers, and missing required fields are denied or ignored without
      crashing the UI, leaking secrets, or corrupting state.
- [ ] Re-audit cleartext private-network behavior.
      Acceptance: public HTTP remains blocked, HTTPS remains allowed, private
      LAN/VPN hosts are allowed only after explicit user intent/pairing, and the
      UI keeps the "VPN/private network only" warning visible in connection
      flows.

## P12 - Automated Mobile QA And Observability

Purpose: make regressions visible before manual beta testing. Risk: medium
because current checks prove build correctness but not enough user workflows.
Scope guardrail: tests and diagnostics stay inside `apps/mobile/` unless root
workspace wiring is required.

### Automated QA

- [ ] Add emulator UI flow automation beyond screenshot capture.
      Acceptance: one command installs the app and asserts visible UI text/state
      for launch, drawer, settings, discovery result, model/mode sheet, tool
      sheet, and composer; failures include screenshots.
- [ ] Add live-backend integration smoke tests with redacted output.
      Acceptance: when a local backend is available, a documented opt-in command
      pairs with a test token or preconfigured session, subscribes to shell,
      opens a thread, and verifies one read-only tool path without committing
      private data.
- [ ] Add screenshot comparison guardrails for critical mobile screens.
      Acceptance: baseline screenshots for normal phone and large emulator
      sizes catch clipped text, overlapping controls, missing composer, broken
      drawer width, and unreadable dark/light mode.
- [ ] Add mobile accessibility checks.
      Acceptance: touch targets, labels, dynamic text sizing, contrast,
      reduced-motion behavior, and screen-reader labels are audited for chat,
      drawer, settings, model/mode, git, files, diff, and terminal screens.

### Diagnostics

- [ ] Add in-app connection and protocol diagnostics screen.
      Acceptance: users can see current backend host, auth state, ws state,
      heartbeat/reconnect status, subscriptions, outbox count, last error, and
      discovery candidates without exposing secrets.
- [ ] Add structured mobile error taxonomy.
      Acceptance: discovery, auth, ws, command, git, file, terminal, diff, and
      rendering errors map to user-facing messages plus developer diagnostics
      that are stable enough for tests and support.

## P13 - Documentation And Support Readiness

Purpose: make the app supportable by a fresh agent or tester without reverse
engineering the mobile code. Risk: medium because stale docs cause false
production claims. Scope guardrail: docs describe the mobile app and validation
state; they must not imply backend modifications.

### Docs

- [ ] Update `plan_mobile.md` to match current implementation status.
      Acceptance: the plan says Ionic Vue/Capacitor is the active stack,
      Avalonia is abandoned, existing backend code stays untouched, completed
      P0-P6 work is summarized, and remaining Android production gates point to
      this TODO.
- [ ] Add Android beta tester setup docs.
      Acceptance: docs explain how to launch the desktop backend for private
      network access, find the correct LAN/VPN URL, pair the phone, revoke
      access, collect diagnostics, and report failures without sharing secrets.
- [ ] Add mobile support triage docs.
      Acceptance: common failures are documented: backend not detected,
      loopback-only desktop binding, cleartext rejection, pairing failure,
      expired ws-token, VPN drop, provider unavailable, git auth failure,
      terminal not opening, and Android install/signing issues.
- [ ] Keep AGENTS/TODO/README synchronized after every mobile production slice.
      Acceptance: each future implementation batch updates the relevant doc
      status and removes or narrows any completed broad claims.

## Deferred / Future Work

- iOS build, signing, and TestFlight after Android proves UX and backend
  compatibility.
- Side-by-side diff viewer after unified diff is production-stable.
- Native desktop replacement work after the mobile app proves the Ionic client
  architecture.
