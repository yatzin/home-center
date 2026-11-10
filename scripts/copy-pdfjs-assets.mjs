// Copies the PDF viewer's data files (character maps, standard fonts, wasm decoders,
// colour profile) from pdfjs-dist into public/pdfjs, where the in-app file viewer
// loads them from. Re-run after changing the pdfjs-dist version:
//   node scripts/copy-pdfjs-assets.mjs
import { cpSync, mkdirSync, rmSync } from "node:fs"

const from = "node_modules/pdfjs-dist"
const to = "public/pdfjs"
rmSync(to, { recursive: true, force: true })
mkdirSync(to, { recursive: true })
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) cpSync(`${from}/${dir}`, `${to}/${dir}`, { recursive: true })
console.log(`Copied PDF viewer assets to ${to}`)
