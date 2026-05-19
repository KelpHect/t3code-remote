#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mobile_root="$(cd -- "$script_dir/.." && pwd)"

cd "$mobile_root"

export ANDROID_HOME="${ANDROID_HOME:-/home/kellhect/Android/Sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

adb_bin="${ADB:-adb}"
package_name="codes.t3.mobile"
apk_path="$mobile_root/android/app/build/outputs/apk/debug/app-debug.apk"
screenshots_root="$mobile_root/docs/screenshots"
timestamp="$(date +%Y%m%d-%H%M%S)"
output_dir="$screenshots_root/smoke-$timestamp"

if ! command -v "$adb_bin" >/dev/null 2>&1; then
  echo "adb was not found. Set ANDROID_HOME or ADB before running this script." >&2
  exit 1
fi

device="${ANDROID_SERIAL:-}"
if [[ -z "$device" ]]; then
  device="$("$adb_bin" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
fi

if [[ -z "$device" ]]; then
  echo "No online Android device or emulator was found." >&2
  "$adb_bin" devices >&2
  exit 1
fi

adb_device() {
  "$adb_bin" -s "$device" "$@"
}

capture() {
  local name="$1"
  adb_device exec-out screencap -p > "$output_dir/$name.png"
  echo "Captured $output_dir/$name.png"
}

tap_ratio() {
  local ratio_x="$1"
  local ratio_y="$2"
  awk -v width="$screen_width" -v height="$screen_height" -v x="$ratio_x" -v y="$ratio_y" \
    'BEGIN { printf "%d %d", width * x, height * y }'
}

bun run android:assemble:debug

if [[ ! -f "$apk_path" ]]; then
  echo "Debug APK was not created at $apk_path" >&2
  exit 1
fi

mkdir -p "$output_dir"

adb_device wait-for-device
adb_device install -r "$apk_path" >/dev/null
adb_device shell am force-stop "$package_name" >/dev/null 2>&1 || true
adb_device shell monkey -p "$package_name" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 3

screen_size="$(adb_device shell wm size | awk -F': ' '/Physical size/ { print $2; exit }' | tr -d '\r')"
if [[ -z "$screen_size" || "$screen_size" != *x* ]]; then
  echo "Could not determine emulator screen size." >&2
  exit 1
fi

screen_width="${screen_size%x*}"
screen_height="${screen_size#*x}"

capture "01-launch"

read -r tap_x tap_y <<< "$(tap_ratio 0.08 0.08)"
adb_device shell input tap "$tap_x" "$tap_y"
sleep 1
capture "02-menu"

adb_device shell input keyevent KEYCODE_BACK
sleep 1
read -r tap_x tap_y <<< "$(tap_ratio 0.92 0.08)"
adb_device shell input tap "$tap_x" "$tap_y"
sleep 1
capture "03-actions"

adb_device shell input keyevent KEYCODE_BACK
sleep 1
read -r tap_x tap_y <<< "$(tap_ratio 0.35 0.94)"
adb_device shell input tap "$tap_x" "$tap_y"
sleep 1
capture "04-composer"

echo "Android smoke screenshots written to $output_dir"
