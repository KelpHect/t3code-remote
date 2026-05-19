#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

is_jdk_21_or_newer() {
  local java_home="$1"
  if [[ ! -x "$java_home/bin/java" || ! -x "$java_home/bin/javac" ]]; then
    return 1
  fi

  local version major
  version="$("$java_home/bin/java" -version 2>&1 | awk -F '"' '/version/ { print $2; exit }')"
  major="${version%%.*}"
  if [[ "$major" == "1" ]]; then
    major="$(printf "%s" "$version" | cut -d. -f2)"
  fi

  [[ "$major" =~ ^[0-9]+$ && "$major" -ge 21 ]]
}

pick_jbr() {
  local candidates=()
  if [[ -n "${ANDROID_STUDIO_JBR:-}" ]]; then
    candidates+=("$ANDROID_STUDIO_JBR")
  fi
  candidates+=(
    "$HOME/Downloads/android-studio/jbr"
    "$HOME/android-studio/jbr"
    "/opt/android-studio/jbr"
    "/usr/local/android-studio/jbr"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if is_jdk_21_or_newer "$candidate"; then
      printf "%s\n" "$candidate"
      return 0
    fi
  done
}

if [[ -z "${JAVA_HOME:-}" ]] || ! is_jdk_21_or_newer "$JAVA_HOME"; then
  if JBR_HOME="$(pick_jbr)"; then
    export JAVA_HOME="$JBR_HOME"
  fi
fi

if [[ -n "${JAVA_HOME:-}" ]]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

cd "$APP_DIR/android"
exec ./gradlew "$@"
