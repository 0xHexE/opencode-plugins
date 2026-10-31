import { Plugin } from "@opencode/plugin/tui"
import { BoxRenderable, RGBA, TextRenderable, type Renderable } from "@opentui/core"
import { onMount } from "solid-js"

// The same character Pi draws its input lines with.
const RULE_ABOVE = "─".repeat(1000)
const RULE_BELOW = "─".repeat(1000)

const SESSION_PANE = "session-pane"
const MESSAGE_ROW = "msg_"
const MESSAGE_INDENT = 1
const TRANSCRIPT_PULL = 2
const CARD_SCAN_MS = 100
// How much of the agent color a sent message's background keeps; the rest is the background.
const MESSAGE_TINT = 0.15
const MESSAGE_TINT_HOVER = 0.22

// How much of the agent color the lines keep; the rest is the background.
const RULE_STRENGTH = 0.55

export default Plugin.define({
  id: "local.minimal-ui",
  setup(context) {
    // Prompt has no styling API, but this slot mounts once inside every prompt, which gives a
    // reference to restyle its renderables without polling. Host updates may change their shape;
    // minimalPrompt bails out on anything unexpected and leaves the stock prompt in place.
    // The footer recreates its version text when a resize crosses its width threshold.
    const hide = () => setTimeout(() => hideVersion(context), 50)
    context.renderer.on("resize", hide)
    const unregisterFooter = context.ui.slot({
      append: "home.footer.status",
      render: () => {
        onMount(hide)
        return <box position="absolute" width={0} height={0} />
      },
    })
    // Sent messages have no slot and mount and unmount as the transcript scrolls, so each drawn frame
    // restyles any new ones. Rows already handled cost one WeakSet lookup.
    const panes = new Set<Node>()
    let lastCardScan = 0
    const restyleMessages = async () => {
      panes.forEach((pane) => {
        if (pane.isDestroyed) return void panes.delete(pane)
        const scroll = transcript(pane)
        if (!scroll) return
        let changed = false
        // Every transcript row indents its text; pull them all back so replies aren't pushed right.
        if (scroll.marginLeft !== -TRANSCRIPT_PULL) {
          scroll.marginLeft = -TRANSCRIPT_PULL
          changed = true
        }
        const rows = messageRows(scroll)
        for (const row of rows) changed = minimalMessage(context, row) || changed
        // Cards can appear deep inside a row, so this walk runs ten times a second rather than per frame.
        if (Date.now() - lastCardScan >= CARD_SCAN_MS) {
          lastCardScan = Date.now()
          for (const row of rows) changed = indentCards(row, scroll.x) || changed
        }
        if (changed) context.renderer.requestRender()
      })
    }
    context.renderer.setFrameCallback(restyleMessages)
    const unregisterPrompt = context.ui.slot({
      append: "prompt.footer",
      render: () => {
        let probe: Renderable | undefined
        onMount(() =>
          setTimeout(() => {
            if (!probe) return
            const pane = ancestors(probe).find((node) => node.id === SESSION_PANE)
            if (pane) panes.add(pane)
            minimalPrompt(context, probe)
          }),
        )
        return <box ref={(node: Renderable) => (probe = node)} position="absolute" width={0} height={0} />
      },
    })
    return () => {
      context.renderer.off("resize", hide)
      context.renderer.removeFrameCallback(restyleMessages)
      unregisterFooter()
      unregisterPrompt()
    }
  },
})

type Node = Renderable & Record<string, any>
type Context = Parameters<NonNullable<Parameters<typeof Plugin.define>[0]["setup"]>>[0]

function minimalPrompt(context: Context, probe: Renderable) {
  const anchor = ancestors(probe).find((node) => children(node).some((child) => findEditor(child)))
  const editor = anchor && findEditor(anchor)
  const inner = editor?.parent as Node | null | undefined
  const frame = inner?.parent as Node | null | undefined
  if (!anchor || !editor || !inner || !frame || frame.parent !== anchor) return
  // The slot remounts on a plugin reload while the prompt it restyled stays mounted.
  if (frame.border === false) return

  const rows = children(anchor)
  const tail = rows[rows.indexOf(frame) + 1]
  const siblings = children(inner)
  const metadata = siblings[siblings.indexOf(editor) + 1]
  const footer = [probe as Node, ...ancestors(probe)].find((node) => node.parent === anchor)
  if (!tail || !metadata || !footer) return

  // Full-width rules above and below instead of the filled box with a side bar.
  const soften = (color: RGBA) => tint(context, color, RULE_STRENGTH)
  const color = soften(frame.borderColor)
  const rules = [rule(context, color, RULE_ABOVE), rule(context, color, RULE_BELOW)]
  const lines = rules.map((box) => children(box)[0]!)
  // The host's agent color now drives the rules. Assigning a border color would also restore the border.
  Object.defineProperty(frame, "borderColor", {
    configurable: true,
    get: () => lines[0]!.fg,
    set: (value: RGBA) => lines.forEach((line) => (line.fg = soften(value))),
  })
  frame.border = false
  // The host reassigns the prompt background on theme changes, so override the
  // property instead of setting it once.
  const transparent = RGBA.fromValues(0, 0, 0, 0)
  const paint = Object.getOwnPropertyDescriptor(BoxRenderable.prototype, "backgroundColor")!
  Object.defineProperty(inner, "backgroundColor", {
    configurable: true,
    get: () => paint.get!.call(inner),
    set: () => paint.set!.call(inner, transparent),
  })
  paint.set!.call(inner, transparent)
  inner.paddingLeft = 0
  inner.paddingRight = 0
  inner.paddingTop = 0
  tail.visible = false
  anchor.add(rules[0]!, rows.indexOf(frame))
  anchor.add(rules[1]!, rows.indexOf(frame) + 2)

  // A prompt character in front of the text.
  editor.marginLeft = 2
  const marker = new BoxRenderable(context.renderer, { position: "absolute", left: 0, top: 0, width: 1, height: 1 })
  marker.add(new TextRenderable(context.renderer, { content: ">", fg: context.theme.text.muted, selectable: false }))
  inner.add(marker)

  // The agent and model join the footer row, still driven by the host. The row wraps when it can't
  // all fit, because shrinking would break the agent's name mid-word.
  inner.remove(metadata)
  metadata.paddingTop = 0
  footer.flexWrap = "wrap"
  footer.add(metadata, 0)

  if (context.ui.router.current().type === "home") minimalHome(anchor)
}

function tint(context: Context, color: RGBA, strength: number) {
  const background = context.theme.background.base
  const mix = (from: number, to: number) => to + (from - to) * strength
  return RGBA.fromValues(mix(color.r, background.r), mix(color.g, background.g), mix(color.b, background.b), 1)
}

function messageRows(scroll: Node) {
  return children(scroll).filter((row) => row.id.startsWith(MESSAGE_ROW))
}

function transcript(node: Node): Node | undefined {
  for (const child of children(node)) {
    if (child.id.startsWith("scrollbox")) {
      if (messageRows(child).length > 0) return child
      continue
    }
    const found = transcript(child)
    if (found) return found
  }
}

// Tool cards sit at the transcript's left edge with a side bar, so the pull would leave them hanging
// out past the text. Rows that are already indented don't reach the edge and stay as they are.
function indentCards(node: Node, edge: number): boolean {
  let changed = false
  for (const child of children(node)) {
    if (Array.isArray(child.border) && child.border[0] === "left") {
      if (child.x === edge) {
        child.marginLeft = TRANSCRIPT_PULL
        changed = true
      }
      continue
    }
    changed = indentCards(child, edge) || changed
  }
  return changed
}

const seenMessages = new WeakSet<Node>()

// A block like Pi's, with no side bar. Its text starts in the column replies start at.
function minimalMessage(context: Context, row: Node) {
  const frame = children(row)[0]
  if (!frame || seenMessages.has(frame)) return false
  seenMessages.add(frame)
  if (!Array.isArray(frame.border) || frame.border[0] !== "left") return false
  if (!frame.backgroundColor.equals(context.theme.background.raised.base)) return false
  const inner = children(frame).find((child) => !child.id.startsWith("slot-"))
  if (!inner) return false
  // Themes such as carbonfox make the raised background nearly match the base, so the block is tinted
  // with the color the side bar had: the agent's, or the border color while a message is unsent.
  const raised = context.theme.background.raised.base
  const paint = Object.getOwnPropertyDescriptor(BoxRenderable.prototype, "backgroundColor")!
  let agent: RGBA = frame.borderColor
  const repaint = (strength: number) => paint.set!.call(inner, tint(context, agent, strength))
  const fill = () => {
    paint.set!.call(frame, tint(context, agent, MESSAGE_TINT))
    repaint(MESSAGE_TINT)
  }
  // Assigning a border color would restore the border.
  Object.defineProperty(frame, "borderColor", {
    configurable: true,
    get: () => agent,
    set: (value: RGBA) => {
      agent = value
      fill()
    },
  })
  // The host only ever assigns its plain color or, while hovered, a darker one.
  Object.defineProperty(inner, "backgroundColor", {
    configurable: true,
    get: () => paint.get!.call(inner),
    set: (value: RGBA) => repaint(value.equals(raised) ? MESSAGE_TINT : MESSAGE_TINT_HOVER),
  })
  frame.border = false
  // The block stays lined up with the input, against the transcript's pull.
  frame.marginLeft = TRANSCRIPT_PULL
  inner.paddingLeft = MESSAGE_INDENT
  fill()
  return true
}

function rule(context: Context, color: RGBA, line: string) {
  const box = new BoxRenderable(context.renderer, { width: "100%", height: 1, flexShrink: 0, overflow: "hidden" })
  box.add(new TextRenderable(context.renderer, { content: line, fg: color, wrapMode: "none", selectable: false }))
  return box
}

function minimalHome(anchor: Node) {
  const wrapper = anchor.parent as Node | null
  const home = wrapper?.parent as Node | null | undefined
  if (!wrapper || !home) return
  const rows = children(home)
  const index = rows.indexOf(wrapper)
  // Dock the prompt at the bottom, full width, and drop the block logo. That also covers the stock
  // update notice, which sits above the prompt at the logo's width; the update-button plugin replaces it.
  wrapper.maxWidth = undefined
  // The same gap under the prompt that a session has.
  home.paddingBottom = 1
  rows.slice(index + 1).forEach((row) => (row.flexGrow = 0))
  rows
    .slice(1, index)
    .filter((row) => !row.id.startsWith("slot-"))
    .forEach((row) => (row.visible = false))
}

function hideVersion(context: Context) {
  if (context.ui.router.current().type !== "home") return
  // The home footer also shows MCP and plugin health, so only its version text goes.
  const version = descendants(context.renderer.root).find((node) => node.plainText === context.app.version)
  const row = version?.parent?.parent as Node | null | undefined
  if (!version?.parent || !row) return
  version.parent.visible = false
  row.paddingTop = 0
  row.paddingBottom = 0
}

function descendants(node: Node): Node[] {
  return children(node).flatMap((child) => [child, ...descendants(child)])
}

function ancestors(node: Renderable) {
  const result: Node[] = []
  for (let current = node.parent as Node | null; current; current = current.parent as Node | null) result.push(current)
  return result
}

function children(node: Renderable) {
  // Styled text has span nodes and plain strings as children, which aren't renderables.
  return (node.getChildren() as Node[]).filter(
    (child) => typeof child?.getChildren === "function" && typeof child.id === "string",
  )
}

function findEditor(node: Node): Node | undefined {
  if ("editBuffer" in node) return node
  for (const child of children(node)) {
    const found = findEditor(child)
    if (found) return found
  }
}
