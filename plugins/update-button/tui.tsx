import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const CHECK_TIMEOUT_MS = 10_000

export default Plugin.define({
  id: "local.update-button",
  setup(context) {
    const [latest, setLatest] = createSignal<string>()
    const [hovered, setHovered] = createSignal(false)

    // The same release endpoint OpenCode's updater reads. A failed check just leaves the button hidden.
    const check = async () => {
      const response = await fetch(
        `https://opencode.ai/update/api/latest/cli/npm?current=${encodeURIComponent(context.app.version)}`,
        { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
      ).catch(() => undefined)
      const data = response?.ok ? ((await response.json().catch(() => undefined)) as { version?: string } | undefined) : undefined
      if (data?.version && isNewer(data.version, context.app.version)) setLatest(data.version)
    }
    void check()
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS)

    const unregister = context.ui.slot({
      append: "prompt.footer",
      render: () => (
        <Show when={latest()}>
          {(version) => (
            <box
              flexShrink={0}
              onMouseOver={() => setHovered(true)}
              onMouseOut={() => setHovered(false)}
              // OpenCode's own dialog handles confirming, installing and restarting.
              onMouseUp={() => context.keymap.dispatch("opencode.update")}
            >
              <text fg={hovered() ? context.theme.text.base : context.theme.text.feedback.info.base} selectable={false}>
                ↑ update {version()}
              </text>
            </box>
          )}
        </Show>
      ),
    })
    return () => {
      clearInterval(timer)
      unregister()
    }
  },
})

function isNewer(candidate: string, current: string) {
  const parse = (version: string) => version.replace(/^v/, "").split("-")[0]!.split(".").map(Number)
  const next = parse(candidate)
  const installed = parse(current)
  for (const index of [0, 1, 2]) {
    if ((next[index] ?? 0) !== (installed[index] ?? 0)) return (next[index] ?? 0) > (installed[index] ?? 0)
  }
  return false
}
