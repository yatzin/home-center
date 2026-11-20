// Document extraction process. Uploaded files are untrusted, and parsing them
// (zipped office files, mail, spreadsheets, PDFs) runs here rather than in the
// server process: a decompression bomb or a parser stuck in a synchronous loop
// takes down this process only, and the server kills it on timeout. One file
// per process; the server kills it after the answer, which also hands back
// everything the parsers and OCR allocated.
//
// The extractors are TypeScript under lib/documents/extract. tsx compiles them
// on load (a runtime dependency, as for the seed), so they aren't duplicated here.
import { pathToFileURL } from "node:url"
import { register } from "tsx/esm/api"
import { register as registerCjs } from "tsx/cjs/api"

// The server going away (crash, restart) closes the channel; don't linger.
process.on("disconnect", () => process.exit(0))

const { entry } = JSON.parse(process.argv[2])

// Both loaders: without "type": "module" the .ts files are compiled as CommonJS.
register()
registerCjs()
const { extractFile } = await import(pathToFileURL(entry).href)

process.once("message", async ({ filePath, ext, opts }) => {
  try {
    process.send({ ok: true, result: await extractFile(filePath, ext, opts) })
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? String(e.name) : "Error"
    // Only ExtractError messages are fixed phrases; anything else can carry document text.
    process.send({ ok: false, name, message: name === "ExtractError" ? String(e.message) : undefined })
  }
})
