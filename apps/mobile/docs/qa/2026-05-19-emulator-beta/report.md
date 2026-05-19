# Android Emulator Beta Proof - 2026-05-19

## Scope

This pass tested the Ionic Vue/Capacitor Android app against the live,
unmodified T3 desktop backend running on this development machine.

## Environment

- Host backend: live T3 desktop app on `127.0.0.1:3773`.
- Android target: `emulator-5554` using `MyAndroidAVD`.
- Connectivity: `adb reverse tcp:3773 tcp:3773` was required because the
  current desktop backend was bound to loopback only. Direct
  `http://10.0.2.2:3773` discovery remains unproven for this backend state.
- Pairing: generated through the existing server pairing CLI and used only for
  the emulator run. No pairing token, bearer token, or WebSocket token is
  recorded in this report or screenshots.

## Commands

```sh
bun --cwd apps/mobile validate
bun --cwd apps/mobile android:smoke
```

The full root gates must still be run before committing this production slice.

## Results

- Pairing succeeded against the live backend after Android WebView fixes.
- Realtime WebSocket connection became active.
- Shell subscription loaded real backend state, including the active project,
  thread, branch, message count, and action count.
- Diff tool opened the full-thread unified diff view.
- Git tool loaded repository status and changed-file summary.
- Files tool browsed the active project root.
- Terminal tool opened a backend terminal, accepted `pwd`, displayed the
  project path output, and was closed after the check.

## Evidence

- `01-shell-synced.png`: paired, realtime, and shell-synced state.
- `02-diff-tool.png`: full-thread diff view.
- `03-git-tool.png`: git status view.
- `04-files-tool.png`: file browser view.
- `05-terminal-tool.png`: terminal empty state.
- `06-terminal-output.png`: terminal command output proof.

## Defects Fixed During This Pass

- Bound default browser `fetch` through `globalThis.fetch(...)` for auth and
  discovery calls. Android WebView threw `Illegal invocation` when private
  methods were called unbound.
- Bound default timers through `globalThis.setTimeout(...)` and
  `globalThis.clearTimeout(...)` in the realtime connection loop. Android
  WebView threw `Illegal invocation` when reconnect timers were called unbound.
- Served the Capacitor Android WebView through local `http://localhost` so
  private `http://` LAN/VPN/emulator backend requests are not blocked as mixed
  content. Public cleartext backend URLs are still rejected by mobile URL
  validation.

## Not Proven In This Pass

- Direct emulator host discovery through `http://10.0.2.2:3773`, because the
  current desktop backend only listened on `127.0.0.1:3773`.
- Sending, stopping, and continuing a live chat turn. This was intentionally
  left for a disposable test thread so the proof does not mutate an active user
  thread.
- Physical Android LAN/VPN behavior.

## New Follow-Up

Android logcat showed Capacitor debug logging for the secure-storage plugin
method payload. Production readiness requires disabling or redacting any plugin
logs that can include stored auth session values.
