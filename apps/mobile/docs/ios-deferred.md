# iOS Deferred Checklist

iOS work is intentionally blocked until the Android beta gate passes on real
device or emulator testing. Do not generate or modify a Capacitor `ios/`
platform tree before that proof.

Prerequisites before starting iOS:

- macOS machine with current Xcode and command-line tools.
- Apple Developer Program team, bundle identifier, signing certificates, and
  provisioning profiles for `codes.t3.mobile`.
- Capacitor iOS platform decision recorded in `apps/mobile/README.md` before
  scaffold generation.
- ATS and local-network entitlement review for paired private LAN/VPN backends.
- Secure token storage validation on iOS Keychain.
- Simulator smoke test and physical-device private-network pairing test.
- TestFlight packaging path and release checklist.

Android beta gate that must pass first:

- Pair with an unmodified desktop T3 backend over emulator host networking,
  LAN, and VPN.
- Continue an existing project thread and send a new turn.
- View active work state, diffs, git status, file navigation, and terminal
  surfaces without layout clipping.
- Lose and regain network connectivity without corrupting local drafts or
  backend state.
