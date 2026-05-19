# Mobile Validation Baseline

Last refreshed: 2026-05-19.

Mobile gate:

```sh
bun --cwd apps/mobile validate
```

The wrapper expands to:

```sh
bun --cwd apps/mobile lint
bun --cwd apps/mobile typecheck
bun --cwd apps/mobile test
bun --cwd apps/mobile build
bun --cwd apps/mobile cap:sync:android
```

Root gate:

```sh
bun fmt
bun lint
bun typecheck
TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test
```

Current baseline notes:

- `bun lint` exits successfully with 9 existing warnings in web/client code.
  Treat warnings in touched mobile files as failures.
- Root tests must use the C locale passthrough above so localized git stderr
  assertions stay stable.
- `bun --cwd apps/mobile build` emits Ionic/lightningcss `:host-context`
  warnings and a chunk-size warning from the current dependency output. These
  are non-failing baseline warnings.
- Android sync requires `ANDROID_HOME=/home/kellhect/Android/Sdk` and SDK
  platform tools on `PATH`.

Latest evidence:

- `bun --cwd apps/mobile validate`: passed.
- `bun fmt`: passed on 1142 files.
- `bun lint`: passed with 9 existing warnings in web/client code.
- `bun typecheck`: passed with 14 successful tasks.
- `TURBO_ENV_MODE=loose LANG=C LC_ALL=C LANGUAGE=C bun run test`: passed with
  123 files passed, 1 skipped, 1022 tests passed, and 4 skipped.
