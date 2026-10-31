# iroh tunnel

Lets the OpenCode Android app reach this server peer to peer with [iroh](https://www.iroh.computer), with no open port,
tunnel service or VPN. The app finds it by itself the next time it connects by any other route, and from then on uses
whichever way is fastest.

## Install

Tap **Set Up Peer to Peer** in the app, under Settings, Server Details. Or run this on the server:

```sh
curl -fsSL https://raw.githubusercontent.com/0xHexE/opencode-plugins/main/install.sh | bash -s -- iroh
```

## What it does

- Traffic is end-to-end encrypted, and goes directly between the devices when the network allows. Otherwise it passes
  through iroh's public relays, which can't read it. The public relays are rate-limited.
- Each stream goes only to this server's own loopback port, and the server's password is still required.
- The device key that gives the server its address is kept in `~/.local/share/opencode/iroh-tunnel/secret.json`.
  Deleting it gives the server a new address.

If it can't find the server's port (it looks through `/proc`, so this is Linux only), name it:

```jsonc
{ "plugins": [{ "package": "./plugins/iroh", "options": { "port": 4096 } }] }
```

## Connecting from a new phone

```sh
curl -u opencode:PASSWORD -H 'content-type: application/json' -d '{"input":{}}' http://127.0.0.1:PORT/api/rpc/iroh/address
```

Enter `iroh://` followed by that endpoint as the server address in the app, with the server's password.

## Remove

Delete `~/.config/opencode/plugins/iroh`.
