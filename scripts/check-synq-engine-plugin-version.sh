#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PLUGIN_HEADER_FILE="apps/synq-engine-plugin/plugin.php"
PLUGIN_CONST_FILE="apps/synq-engine-plugin/includes/constants.php"

if [[ ! -f "$PLUGIN_HEADER_FILE" || ! -f "$PLUGIN_CONST_FILE" ]]; then
  echo "Missing plugin version files." >&2
  exit 1
fi

extract_header_version() {
  local file="$1"
  sed -nE "s/^ \* Version: ([0-9]+\\.[0-9]+\\.[0-9]+)$/\\1/p" "$file" | head -n1
}

extract_const_version() {
  local file="$1"
  sed -nE "s/^    public const PLUGIN_VERSION = '([0-9]+\\.[0-9]+\\.[0-9]+)';$/\\1/p" "$file" | head -n1
}

CURRENT_HEADER_VERSION="$(extract_header_version "$PLUGIN_HEADER_FILE")"
CURRENT_CONST_VERSION="$(extract_const_version "$PLUGIN_CONST_FILE")"

if [[ -z "$CURRENT_HEADER_VERSION" || -z "$CURRENT_CONST_VERSION" ]]; then
  echo "Unable to parse plugin version(s)." >&2
  exit 1
fi

if [[ "$CURRENT_HEADER_VERSION" != "$CURRENT_CONST_VERSION" ]]; then
  echo "Plugin versions are out of sync: plugin.php=$CURRENT_HEADER_VERSION constants.php=$CURRENT_CONST_VERSION" >&2
  exit 1
fi

BASE_REF=""
if [[ "${1:-}" == "--base" ]]; then
  BASE_REF="${2:-}"
  if [[ -z "$BASE_REF" ]]; then
    echo "--base requires a git ref argument." >&2
    exit 1
  fi
fi

VERSION_BASE_REF="HEAD"
if [[ -n "$BASE_REF" ]]; then
  if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
    echo "Base ref '$BASE_REF' not found." >&2
    exit 1
  fi
  VERSION_BASE_REF="$BASE_REF"
  CHANGED_PLUGIN_FILES="$(git diff --name-only "$BASE_REF...HEAD" -- apps/synq-engine-plugin ':!apps/synq-engine-plugin/README.md')"
else
  CHANGED_PLUGIN_FILES="$(git diff --name-only HEAD -- apps/synq-engine-plugin ':!apps/synq-engine-plugin/README.md')"
fi

if [[ -z "$CHANGED_PLUGIN_FILES" ]]; then
  echo "Plugin version check passed (no plugin code/asset changes detected)."
  exit 0
fi

if ! git cat-file -e "$VERSION_BASE_REF":"$PLUGIN_HEADER_FILE" >/dev/null 2>&1; then
  echo "Plugin version check passed (no baseline plugin.php in $VERSION_BASE_REF)." >&2
  exit 0
fi

if ! git cat-file -e "$VERSION_BASE_REF":"$PLUGIN_CONST_FILE" >/dev/null 2>&1; then
  echo "Plugin version check passed (no baseline constants.php in $VERSION_BASE_REF)." >&2
  exit 0
fi

BASE_HEADER_VERSION="$(git show "$VERSION_BASE_REF":"$PLUGIN_HEADER_FILE" | sed -nE "s/^ \\* Version: ([0-9]+\\.[0-9]+\\.[0-9]+)$/\\1/p" | head -n1)"
BASE_CONST_VERSION="$(git show "$VERSION_BASE_REF":"$PLUGIN_CONST_FILE" | sed -nE "s/^    public const PLUGIN_VERSION = '([0-9]+\\.[0-9]+\\.[0-9]+)';$/\\1/p" | head -n1)"

if [[ "$CURRENT_HEADER_VERSION" == "$BASE_HEADER_VERSION" && "$CURRENT_CONST_VERSION" == "$BASE_CONST_VERSION" ]]; then
  echo "Plugin files changed but plugin version did not change (still $CURRENT_HEADER_VERSION)." >&2
  echo "Please bump plugin.php header Version and Constants::PLUGIN_VERSION." >&2
  exit 1
fi

echo "Plugin version check passed."
