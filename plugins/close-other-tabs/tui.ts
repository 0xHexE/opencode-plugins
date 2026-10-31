import { Plugin } from "@opencode/plugin/tui"
import { BoxRenderable, MouseEvent, TextRenderable, type Renderable } from "@opentui/core"

const RIGHT_MOUSE_BUTTON = 2
const MENU_ZINDEX = 2500
const MENU_MARKER = "Copy session ID"
const TAB_TITLE = "title_shimmer"
const TITLE = "Close other tabs"
const REGENERATE = "Regenerate title"

export default Plugin.define({
  id: "local.close-other-tabs",
  setup(context) {
    const regenerating = new Set<string>()
    // A reload mid-flight disposes setup, so anything still animating has to be handed back here or
    // its timer keeps painting frames over the tab's real title.
    const animating = new Set<{ stop: (title?: string) => void }>()
    const regenerate = async (sessionID: string, label?: TabTitle) => {
      if (regenerating.has(sessionID)) return
      regenerating.add(sessionID)
      const animation = label ? animate(label) : undefined
      if (animation) animating.add(animation)
      try {
        // This runs the session's model over its history without adding a turn.
        const result = await context.client.session.generate({
          sessionID,
          prompt: [
            "Write a short title for this conversation, at most six words.",
            "Reply with only the title, without quotes or punctuation at the end.",
          ].join("\n"),
        })
        const title = cleanTitle(result.text)
        if (!title) return animation?.stop()
        await context.client.session.update({ sessionID, title })
        // The tab strip reads its title from the session record, so its cache has to be dropped.
        context.data.session.invalidate(sessionID)
        await context.data.session.sync(sessionID)
        animation?.stop(title)
      } catch (error) {
        animation?.stop()
        context.toast.show({ message: "Could not regenerate the title: " + message(error), variant: "error", duration: 5000 })
      } finally {
        animation?.stop()
        if (animation) animating.delete(animation)
        regenerating.delete(sessionID)
      }
    }

    const closeOthers = (keep: string) => {
      context.ui.tabs.focus(keep)
      context.ui.tabs
        .list()
        .filter((tab) => tab.sessionID !== keep)
        .forEach((tab) => context.ui.tabs.close(tab.sessionID))
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "local.tabs.close_others",
          title: TITLE,
          group: "Tabs",
          palette: true,
          run: () => {
            const active = context.ui.tabs.list().find((tab) => tab.active)
            if (active) closeOthers(active.sessionID)
          },
        },
        {
          id: "local.tabs.regenerate_title",
          title: REGENERATE,
          group: "Tabs",
          palette: true,
          bind: "f8",
          run: () => {
            const active = context.ui.tabs.list().find((tab) => tab.active)
            if (active) void regenerate(active.sessionID)
          },
        },
      ],
      bindings: ["local.tabs.regenerate_title"],
    }))

    // The tab menu has no extension point, so this wraps a private renderer method and edits the
    // menu's renderables. If a release changes either, the row is skipped and the command still works.
    const renderer = context.renderer as unknown as MouseRenderer
    const dispatch = renderer.dispatchMouseEvent
    if (typeof dispatch !== "function") return

    renderer.dispatchMouseEvent = function (target, attributes) {
      const rightClick = attributes.type === "down" && attributes.button === RIGHT_MOUSE_BUTTON
      const sessionID = rightClick ? findTab(context, target) : undefined
      const event = dispatch.call(this, target, attributes)
      // The menu's rows are mounted just after the click is handled.
      // The menu mounts a frame or two after the click, so try again briefly if it isn't there yet.
      const add = (attempt = 0) => {
        if (sessionID && addMenu(context, sessionID, closeOthers, regenerate)) return
        if (attempt < 8) setTimeout(() => add(attempt + 1), 40)
      }
      if (sessionID) setTimeout(add)
      return event
    }
    return () => {
      animating.forEach((animation) => animation.stop())
      animating.clear()
      renderer.dispatchMouseEvent = dispatch
    }
  },
})

type MouseAttributes = { type: string; button: number }
type MouseRenderer = {
  dispatchMouseEvent(target: Renderable, attributes: MouseAttributes): unknown
}
type Context = Parameters<NonNullable<Parameters<typeof Plugin.define>[0]["setup"]>>[0]

// A failed lookup only loses this row. Letting it throw would swallow the click and the whole menu.
function findTab(context: Context, target: Renderable) {
  try {
    return clickedTab(context, target)
  } catch (error) {
    console.error("close-other-tabs: tab lookup failed", error)
  }
}

function clickedTab(context: Context, target: Renderable) {
  const tabs = context.ui.tabs.list()
  const titles = descendants(context.renderer.root).filter((node) => node.id.startsWith(TAB_TITLE))
  for (let node: Renderable | null = target; node; node = node.parent) {
    const inside = titles.filter((title) => contains(node, title))
    if (inside.length > 1) return
    if (inside.length === 0) continue
    // Each tab draws one title, in list order, followed by the new-session slot's title when that
    // slot is promoted to a tab.
    if (titles.length === tabs.length || titles.length === tabs.length + 1) return tabs[titles.indexOf(inside[0]!)]?.sessionID
    // An overflowing strip only draws some tabs, so positions don't line up; trust a unique title.
    const named = tabs.filter((tab) => tab.title === (inside[0] as Renderable & { plainText?: string }).plainText)
    return named.length === 1 ? named[0]!.sessionID : undefined
  }
}

type TabTitle = Renderable & {
  content: string
  rename?: { title: string; pending: boolean }
}

const FRAMES = ["regenerating", "regenerating.", "regenerating..", "regenerating..."]

// The tab strip paints its title from a text renderable. Writing the frames into it gives the dots,
// and its `rename` flag turns on the same shimmer sweep the app uses for automatic titles. The host
// repaints the real title itself once the rename lands.
function animate(label: TabTitle) {
  const original = label.content
  // One rename flag turns on the shimmer sweep; the frames only change the text under it.
  label.content = FRAMES[0]!
  label.rename = { title: FRAMES[0]!, pending: true }
  let frame = 0
  const timer = setInterval(() => {
    if (label.isDestroyed) return clearInterval(timer)
    label.content = FRAMES[frame++ % FRAMES.length]!
  }, 220)
  let stopped = false
  // A safety net: no animation may outlive the request that started it.
  const guard = setTimeout(() => stop(), 15_000)
  return {
    // The last write wins, so hand back the title the host is about to paint.
    stop(title?: string) {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      clearTimeout(guard)
      if (label.isDestroyed) return
      const next = title ?? original
      const paint = () => {
        if (label.isDestroyed) return
        label.content = next
        label.rename = { title: next, pending: false }
      }
      paint()
      // The host can repaint the title once more while its data settles; keep ours last.
      setTimeout(paint, 120)
    },
  }
}

function contains(node: Renderable, child: Renderable) {
  for (let current: Renderable | null = child; current; current = current.parent) {
    if (current === node) return true
  }
  return false
}

function cleanTitle(text: string) {
  const line = text.trim().split("\n").find((value) => value.trim()) ?? ""
  return line
    .replace(/^#+\s*/, "")
    .replace(/^(title|session title)\s*:\s*/i, "")
    .replace(/^["'“”`*]+|["'“”`*]+$/g, "")
    .replace(/[.!]+$/, "")
    .trim()
    .slice(0, 100)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function descendants(node: Renderable): Renderable[] {
  // Styled text has span nodes and plain strings as children, which aren't renderables.
  return (node.getChildren() as Renderable[])
    .filter((child) => typeof child?.getChildren === "function" && typeof child.id === "string")
    .flatMap((child) => [child, ...descendants(child)])
}

function addMenu(
  context: Context,
  sessionID: string,
  closeOthers: (keep: string) => void,
  regenerate: (sessionID: string) => Promise<void>,
) {
  const overlay = findMenu(context.renderer.root)
  const list = overlay?.getChildren()[0] as Renderable | undefined
  if (!overlay || !list) return false
  const renderer = context.renderer
  const make = (title: string, run: (event: MouseEvent) => void) => {
    const row = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexShrink: 0,
      paddingLeft: 1,
      paddingRight: 1,
      onMouseOver() {
        row.backgroundColor = context.theme.background.raised.high
      },
      onMouseOut() {
        row.backgroundColor = "transparent"
      },
      onMouseUp(event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.button === RIGHT_MOUSE_BUTTON) return
        // The overlay's own mouse-down handler is what dismisses the menu.
        overlay.processMouseEvent(new MouseEvent(overlay, { ...event, type: "down" }))
        run(event)
      },
    })
    row.add(new TextRenderable(renderer, { content: title, fg: context.theme.text.base, selectable: false }))
    list.add(row)
    return row
  }
  // The title renderable for this tab; hover and spinner states redraw it, so match the text too.
  const current = context.ui.tabs.list().find((tab) => tab.sessionID === sessionID)?.title
  const label = descendants(context.renderer.root).find(
    (node): node is TabTitle => node.id.startsWith(TAB_TITLE) && node.plainText === current,
  )
  make(REGENERATE, () => void regenerate(sessionID, label))
  // Closing the others only makes sense when there are others.
  const many = context.ui.tabs.list().length > 1
  if (many) make(TITLE, () => closeOthers(sessionID))
  const height = Math.min(list.height + (many ? 2 : 1), renderer.height)
  list.height = height
  list.top = Math.min(Number(list.top), renderer.height - height)
  return true
}

function findMenu(root: Renderable) {
  const portals = root.getChildren() as Renderable[]
  return portals
    .filter((portal) => portal.zIndex === MENU_ZINDEX)
    .flatMap((portal) => portal.getChildren() as Renderable[])
    .find((overlay) => descendants(overlay).some((node) => "plainText" in node && node.plainText === MENU_MARKER))
}
