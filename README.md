# OpenCode plugins

A collection of OpenCode V2 plugins.

## Plugins

Copy the contents of `plugins/` into `~/.config/opencode/plugins/`. OpenCode discovers `.ts` and `.js` files and
immediate plugin package directories there automatically, so no config entry is needed.

| Plugin | Description |
| --- | --- |
| `send-file.js` | Adds a `send_file` tool that shows a file as a card in the OpenCode Android app and downloads it over the existing connection. |
| `close-other-tabs/` | TUI plugin. Adds palette commands **Close other tabs** and **Regenerate title** (F8), plus a tab context-menu entry. |
| `minimal-ui/` | TUI plugin. Minimal UI styling: tinted message cards, ruled input, pulled-back transcript, and a hidden stock version label. |
| `update-button/` | TUI plugin. Shows an `↑ update <version>` button in the prompt footer when a newer OpenCode CLI is available. |

## Notes

- No credentials or tokens are stored in this repository.
