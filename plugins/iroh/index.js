// Lets the OpenCode Android app reach this server peer to peer over iroh (https://www.iroh.computer), with no open port,
// tunnel service or VPN. Connections are end-to-end encrypted and go directly between the devices whenever the network
// allows, including across the same Wi-Fi; otherwise iroh's public relays pass along the encrypted traffic.
//
// Each stream is carried, byte for byte, to this server's own loopback address and nowhere else, and the server's
// password is still required. See README.md in this folder to install it.
import { Endpoint, SecretKey } from "@number0/iroh"
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

const ALPN = Array.from(Buffer.from("opencode/tunnel/1"))
const CHUNK = 64 * 1024

/** The device key, kept between runs so the address given to the phone stays the same. */
function loadKey() {
  const root = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share")
  const folder = path.join(root, "opencode", "iroh-tunnel")
  const file = path.join(folder, "secret.json")
  if (existsSync(file)) return SecretKey.fromBytes(JSON.parse(readFileSync(file, "utf8")))
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const key = SecretKey.generate()
  writeFileSync(file, JSON.stringify(key.toBytes()), { mode: 0o600 })
  chmodSync(file, 0o600)
  return key
}

/** The loopback ports this process listens on. A plugin isn't told its server's address, so it looks. */
function ownPorts() {
  const sockets = new Set()
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const match = readlinkSync(`/proc/self/fd/${fd}`).match(/^socket:\[(\d+)\]$/)
      if (match) sockets.add(match[1])
    } catch {
      // Closed while looking.
    }
  }
  return readFileSync("/proc/net/tcp", "utf8")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((f) => f[3] === "0A" && sockets.has(f[9]) && f[1]?.startsWith("0100007F:"))
    .map((f) => parseInt(f[1].split(":")[1], 16))
}

async function serverPort(options) {
  if (Number.isInteger(options.port)) return options.port
  // Listening may start just after plugins load.
  for (let attempt = 0; attempt < 120; attempt++) {
    for (const port of ownPorts()) {
      const answer = await fetch(`http://127.0.0.1:${port}/api/info`, { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
      if (answer && (answer.status === 200 || answer.status === 401)) return port
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Couldn\'t find this server\'s port. Set it with the plugin option "port".')
}

function carry(stream, port) {
  const socket = net.connect(port, "127.0.0.1")
  socket.setNoDelay(true)
  socket.on("error", () => stream.send.reset(0n).catch(() => {}))

  // Phone to server. An empty read or a failed one means that side is finished.
  void (async () => {
    try {
      while (true) {
        const bytes = await stream.recv.read(CHUNK)
        if (bytes.length === 0) break
        if (!socket.write(Buffer.from(bytes))) await new Promise((resolve) => socket.once("drain", resolve))
      }
      socket.end()
    } catch {
      socket.destroy()
    }
  })()

  // Server to phone, one chunk at a time so a slow phone slows the server down instead of filling memory.
  void (async () => {
    try {
      for await (const chunk of socket) await stream.send.writeAll(Array.from(chunk))
      await stream.send.finish()
    } catch {
      await stream.send.reset(0n).catch(() => {})
      socket.destroy()
    }
  })()
}

async function serve(connection, port) {
  try {
    while (true) carry(await connection.acceptBi(), port)
  } catch {
    // The phone went away. It dials again when it's back.
  }
}

async function start(options) {
  const port = await serverPort(options)
  const endpoint = await Endpoint.bind({ secretKey: loadKey().toBytes(), alpns: [ALPN] })
  void (async () => {
    while (true) {
      const incoming = await endpoint.acceptNext()
      if (!incoming) return
      void incoming
        .accept()
        .then((accepting) => accepting.connect())
        .then((connection) => serve(connection, port))
        .catch(() => {})
    }
  })()
  return endpoint
}

// The plugin SDK would turn a JSON schema into this, and this plugin has no need for the SDK.
const anything = { "~standard": { version: 1, vendor: "opencode-iroh-tunnel", validate: (value) => ({ value }) } }

// Setup runs once per project on this server, and they all share the one endpoint.
const shared = (globalThis[Symbol.for("opencode.iroh-tunnel")] ??= { users: 0, endpoint: undefined })

export default {
  id: "iroh-tunnel",
  async setup(ctx) {
    shared.users++
    shared.endpoint ??= start(ctx.options ?? {})
    const endpoint = await shared.endpoint
    await ctx.rpc.register(
      {
        id: "iroh",
        events: {},
        methods: {
          address: { input: anything, output: anything },
        },
      },
      { address: async () => ({ endpoint: endpoint.id().toString() }) },
    )
    return async () => {
      if (--shared.users > 0) return
      const closing = shared.endpoint
      shared.endpoint = undefined
      await (await closing)?.close()
    }
  },
}
