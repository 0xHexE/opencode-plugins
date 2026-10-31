# OpenCode plugins

A collection of OpenCode V2 plugins.

## Install

Install everything directly from this repository:

```sh
curl -fsSL https://raw.githubusercontent.com/0xHexE/opencode-plugins/main/install.sh | bash
```

The script downloads the plugins into `~/.config/opencode/plugins/` (or `$XDG_CONFIG_HOME/opencode/plugins`).
To install somewhere else, set `OPENCODE_PLUGINS_DIR`:

```sh
curl -fsSL https://raw.githubusercontent.com/0xHexE/opencode-plugins/main/install.sh | OPENCODE_PLUGINS_DIR=/path/to/plugins bash
```

You can also copy the contents of `plugins/` manually into `~/.config/opencode/plugins/`. OpenCode discovers `.ts`
and `.js` files and immediate plugin package directories there automatically, so no config entry is needed.

## Plugins

| Plugin | Description |
| --- | --- |
| `send-file.js` | Adds a `send_file` tool that shows a file as a card in the OpenCode Android app and downloads it over the existing connection. |
| `close-other-tabs/` | TUI plugin. Adds palette commands **Close other tabs** and **Regenerate title** (F8), plus a tab context-menu entry. |
| `minimal-ui/` | TUI plugin. Minimal UI styling: tinted message cards, ruled input, pulled-back transcript, and a hidden stock version label. |

## Notes

- No credentials or tokens are stored in this repository.
