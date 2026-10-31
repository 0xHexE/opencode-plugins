// Gives agents a send_file tool. The OpenCode Android app shows each sent file as a card in the chat, and downloads it
// through the phone's existing connection to this server. Nothing leaves that connection.
//
// Install: copy this file to ~/.config/opencode/plugins/send-file.js. Remove it to uninstall.
import { stat } from "node:fs/promises"
import path from "node:path"

export default {
  id: "send-file",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "send_file",
        description:
          "Send a file from this computer to the user's phone, where it appears in the chat ready to open, share or save. " +
          "Use this whenever the user asks you to send, share or give them a file, such as an APK, image, PDF, archive or " +
          "document. The file must already exist. Always pass an absolute path.",
        options: { codemode: false },
        input: {
          type: "object",
          properties: {
            path: { type: "string", description: "Absolute path of the file to send" },
            note: { type: "string", description: "One short line about the file, shown on its card" },
          },
          required: ["path"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const absolute = path.resolve(ctx.location.directory, input.path)
          const info = await stat(absolute)
          if (!info.isFile()) throw new Error(`${absolute} is not a file`)
          return { content: `Sent ${path.basename(absolute)} (${info.size} bytes) to the user.` }
        },
      })
    })
  },
}
