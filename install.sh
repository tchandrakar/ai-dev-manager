#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# install.sh — Build Akatsuki and install it to /Applications
# Usage (from repo root):  ./install.sh
# ──────────────────────────────────────────────────────────────────────────────
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$REPO_ROOT/akatsuki-app"
INSTALL_TARGET="/Applications/Akatsuki.app"

echo "▶ Building Akatsuki..."
cd "$APP_DIR"

# Package the app (creates out/Akatsuki-darwin-<arch>/Akatsuki.app)
npm run package

# Find the built .app
BUILT_APP=$(find "$APP_DIR/out" -name "Akatsuki.app" -maxdepth 3 | head -1)

if [ -z "$BUILT_APP" ]; then
  echo "✗ Build failed — could not find Akatsuki.app in $APP_DIR/out"
  exit 1
fi

echo "▶ Installing $BUILT_APP → $INSTALL_TARGET"

# Remove previous install if present
if [ -d "$INSTALL_TARGET" ]; then
  rm -rf "$INSTALL_TARGET"
fi

cp -r "$BUILT_APP" "$INSTALL_TARGET"

echo "✓ Akatsuki installed to $INSTALL_TARGET"
echo "  Open Spotlight (⌘Space) and search for 'Akatsuki' to launch."
