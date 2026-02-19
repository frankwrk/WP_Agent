#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_SRC="$ROOT_DIR/apps/synq-engine-plugin"
ADMIN_DIR="$PLUGIN_SRC/admin"
DIST_DIR="$ROOT_DIR/dist"
LEGACY_STAGE_DIR="$ROOT_DIR/.tmp/synq-engine-package"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/synq-engine-package.XXXXXX")"
PACKAGE_ROOT="$STAGE_DIR/synq-engine"
OUTPUT_ZIP="$DIST_DIR/synq-engine.zip"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

rm -rf "$LEGACY_STAGE_DIR"
mkdir -p "$PACKAGE_ROOT" "$DIST_DIR"

echo "Building admin assets..."
npm --prefix "$ADMIN_DIR" run build

echo "Staging plugin files..."
cp "$PLUGIN_SRC/plugin.php" "$PACKAGE_ROOT/plugin.php"
cp "$PLUGIN_SRC/uninstall.php" "$PACKAGE_ROOT/uninstall.php"
cp "$PLUGIN_SRC/README.md" "$PACKAGE_ROOT/README.md"

mkdir -p "$PACKAGE_ROOT/includes" "$PACKAGE_ROOT/admin/dist"
cp -R "$PLUGIN_SRC/includes/" "$PACKAGE_ROOT/includes/"
cp "$PLUGIN_SRC/admin/dist/wp-agent-admin.js" "$PACKAGE_ROOT/admin/dist/wp-agent-admin.js"
cp "$PLUGIN_SRC/admin/dist/wp-agent-admin.css" "$PACKAGE_ROOT/admin/dist/wp-agent-admin.css"

find "$PACKAGE_ROOT" -name ".DS_Store" -type f -delete

echo "Creating package..."
rm -f "$OUTPUT_ZIP"
(
  cd "$STAGE_DIR"
  zip -rq "$OUTPUT_ZIP" "synq-engine"
)

echo "Packaged: $OUTPUT_ZIP"
