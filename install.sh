#!/usr/bin/env bash
set -euo pipefail

REPO="0xHexE/opencode-plugins"
BRANCH="main"
BASE="${OPENCODE_PLUGINS_BASE:-https://raw.githubusercontent.com/${REPO}/${BRANCH}}"
DEST="${OPENCODE_PLUGINS_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins}"

# Everything by default, or only the plugins named: install.sh iroh
PLUGINS=("$@")
[ "${#PLUGINS[@]}" -gt 0 ] || PLUGINS=(send-file close-other-tabs minimal-ui iroh)

command -v curl >/dev/null 2>&1 || {
  echo "error: curl is required" >&2
  exit 1
}

fetch() {
  local target="$DEST/${1#plugins/}"
  local temp="${target}.tmp"
  mkdir -p "$(dirname "$target")"
  curl -fsSL --retry 3 "$BASE/$1" -o "$temp"
  mv -f "$temp" "$target"
}

# A running server remembers a missing package until it restarts, so it must never see this plugin without its
# dependency. It's built beside the plugins folder and moved in whole.
install_iroh() {
  local staging
  staging="$(dirname "$DEST")/.iroh-staging"
  rm -rf "$staging"
  mkdir -p "$staging"
  echo "Downloading the iroh plugin"
  for file in index.js package.json README.md; do
    curl -fsSL --retry 3 "$BASE/plugins/iroh/$file" -o "$staging/$file"
  done
  echo "Installing the iroh library"
  if command -v npm >/dev/null 2>&1; then
    npm install --prefix "$staging" --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
  elif command -v bun >/dev/null 2>&1; then
    (cd "$staging" && bun install --production --ignore-scripts >/dev/null)
  else
    rm -rf "$staging"
    echo "error: the iroh plugin needs npm or bun to fetch its dependency" >&2
    exit 1
  fi
  echo "Moving it into place"
  mkdir -p "$DEST"
  rm -rf "$DEST/iroh"
  mv "$staging" "$DEST/iroh"
}

for plugin in "${PLUGINS[@]}"; do
  echo "Installing or updating $plugin"
  case "$plugin" in
    send-file) fetch plugins/send-file.js ;;
    close-other-tabs) fetch plugins/close-other-tabs/tui.ts ;;
    minimal-ui) fetch plugins/minimal-ui/tui.tsx ;;
    iroh) install_iroh ;;
    *)
      echo "error: unknown plugin: $plugin" >&2
      exit 1
      ;;
  esac
done

echo
echo "Installed or updated ${#PLUGINS[@]} plugins in $DEST"
echo "OpenCode reloads plugins automatically; use /reload if needed."
