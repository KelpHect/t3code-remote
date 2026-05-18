# Android Release Strategy

This strategy applies only to `apps/native-avalonia/`. It does not change the existing Electron, web, server, or Bun release flows.

## Package Metadata

- Package id: `codes.t3.nativeapp`
- Display name: `T3 Code`
- Version name: `0.1.0`
- Version code: `100`
- Icon source: `apps/native-avalonia/T3Code.Native.App.Android/Icon.png`

Version code must increase on every distributed Android artifact. Use semantic versioning for `ApplicationDisplayVersion` and an integer `ApplicationVersion` that can never go backwards for the same package id.

## Debug Artifact

Build a debug APK for emulator and sideload testing:

```sh
source ~/.zshrc
dotnet publish apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj -c Debug
```

Expected artifact:

```text
apps/native-avalonia/T3Code.Native.App.Android/bin/Debug/net10.0-android/publish/codes.t3.nativeapp-Signed.apk
```

Debug artifacts are local test outputs. Do not attach them to releases, and do not keep them under source control.

## Release Artifacts

Release signing is opt-in through environment variables:

```sh
export T3_ANDROID_KEYSTORE=/secure/path/t3-code-upload.keystore
export T3_ANDROID_KEYSTORE_PASSWORD=...
export T3_ANDROID_KEY_ALIAS=t3-code-upload
export T3_ANDROID_KEY_PASSWORD=...
```

Build a store upload bundle:

```sh
source ~/.zshrc
dotnet publish apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj -c Release -p:AndroidPackageFormat=aab
```

Build a sideloadable release APK:

```sh
source ~/.zshrc
dotnet publish apps/native-avalonia/T3Code.Native.App.Android/T3Code.Native.App.Android.csproj -c Release -p:AndroidPackageFormat=apk
```

Expected release output directory:

```text
apps/native-avalonia/T3Code.Native.App.Android/bin/Release/net10.0-android/publish/
```

The release directory is the artifact retention boundary until a separate native release pipeline exists. Copy signed APK/AAB files from there into the release system; do not wire this into existing Electron scripts.

## Signing Rules

- Keep upload keystores outside the repository.
- Use CI or a local secure environment to inject signing environment variables.
- Do not commit keystores, passwords, `.jks`, `.keystore`, generated APKs, or generated AABs.
- Stop before publishing if the signing identity, package id, or store account is unclear.
- Run an emulator or physical-device smoke test on the exact APK/AAB build variant before distribution.
