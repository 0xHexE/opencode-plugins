#!/usr/bin/env bash
set -euo pipefail

REPO="0xHexE/opencode-plugins"
BRANCH="main"
BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DEST="${OPENCODE_PLUGINS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins}"

FILES=(
  "plugins/send-file.js"
  "plugins/close-other-tabs/tui.ts"
  "plugins/minimal-ui/tui.tsx"
)

command -v curl >/dev/null 2>&1 || {
  echo "error: curl is required" >&2
  exit 1
}

for file in "${FILES[@]}"; do
  target="${file#plugins/}"
  mkdir -p "$DEST/$(dirname "$target")"
  echo "Installing $target"
  curl -fsSL --retry 3 "$BASE/$file" -o "$DEST/$target"
done

echo
echo "Installed ${#FILES[@]} plugins into $DEST"
echo "OpenCode reloads plugins automatically; use /reload if needed."
