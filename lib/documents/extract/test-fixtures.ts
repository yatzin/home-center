import { strToU8, zipSync } from "fflate"
import { createCanvas } from "@napi-rs/canvas"

// Tiny but valid files, built in memory so no binaries are committed. Test
// helpers only — imported from *.test.ts, never from app code.

const X = '<?xml version="1.0" encoding="UTF-8"?>'
const OD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
const rels = (items: [string, string, string][]) =>
  `${X}<Relationships xmlns="${PKG}">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${OD}/${type}" Target="${target}"/>`).join("")}</Relationships>`
const types = (overrides: [string, string][]) =>
  `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(([part, ct]) => `<Override PartName="${part}" ContentType="${ct}"/>`).join("")}</Types>`

export function docx(paragraphs: string[]): Buffer {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${esc(p)}</w:t></w:r></w:p>`).join("")
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8(types([["/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"]])),
    "_rels/.rels": strToU8(rels([["rId1", "officeDocument", "word/document.xml"]])),
    "word/document.xml": strToU8(`${X}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
  }))
}

export function xlsx(sheets: { name: string; rows: string[][] }[]): Buffer {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(types([
      ["/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"],
      ...sheets.map((_, i): [string, string] => [`/xl/worksheets/sheet${i + 1}.xml`, "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"]),
    ])),
    "_rels/.rels": strToU8(rels([["rId1", "officeDocument", "xl/workbook.xml"]])),
    "xl/workbook.xml": strToU8(`${X}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${OD}"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(rels(sheets.map((_, i): [string, string, string] => [`rId${i + 1}`, "worksheet", `worksheets/sheet${i + 1}.xml`]))),
  }
  sheets.forEach((s, i) => {
    const rows = s.rows.map((cells, r) => `<row r="${r + 1}">${cells.map((c, col) => `<c r="${String.fromCharCode(65 + col)}${r + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`).join("")}</row>`).join("")
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`${X}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`)
  })
  return Buffer.from(zipSync(files))
}

export function pptx(slides: string[]): Buffer {
  const P = "http://schemas.openxmlformats.org/presentationml/2006/main"
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main"
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(types([
      ["/ppt/presentation.xml", "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"],
      ...slides.map((_, i): [string, string] => [`/ppt/slides/slide${i + 1}.xml`, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"]),
    ])),
    "_rels/.rels": strToU8(rels([["rId1", "officeDocument", "ppt/presentation.xml"]])),
    "ppt/presentation.xml": strToU8(`${X}<p:presentation xmlns:p="${P}" xmlns:r="${OD}"><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(rels(slides.map((_, i): [string, string, string] => [`rId${i + 1}`, "slide", `slides/slide${i + 1}.xml`]))),
  }
  slides.forEach((t, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(`${X}<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)
  })
  return Buffer.from(zipSync(files))
}

export function odt(paragraphs: string[]): Buffer {
  return Buffer.from(zipSync({
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    "META-INF/manifest.xml": strToU8(`${X}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>`),
    "content.xml": strToU8(`${X}<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>${paragraphs.map((p) => `<text:p>${esc(p)}</text:p>`).join("")}</office:text></office:body></office:document-content>`),
  }))
}

/** A PDF with one Helvetica line per page; "" makes a blank page. */
export function textPdf(pages: string[]): Buffer {
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>"]
  objs.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`)
  const font = 3 + pages.length * 2
  pages.forEach((t, i) => {
    const stream = t ? `BT /F1 18 Tf 72 700 Td (${t.replace(/[()\\]/g, "\\$&")}) Tj ET` : ""
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, "latin1")
}

/** Black text on white, as PNG or JPEG. */
export function textImage(text: string, type: "image/png" | "image/jpeg" = "image/png"): { data: Buffer; width: number; height: number } {
  const width = 900
  const height = 200
  const canvas = createCanvas(width, height)
  const g = canvas.getContext("2d")
  g.fillStyle = "white"
  g.fillRect(0, 0, width, height)
  g.fillStyle = "black"
  g.font = "40px sans-serif"
  g.fillText(text, 20, 110)
  return { data: type === "image/png" ? canvas.toBuffer("image/png") : canvas.toBuffer("image/jpeg"), width, height }
}

/** A one-page "scanned" PDF: the page is a JPEG image with no text layer. */
export function scannedPdf(text: string): Buffer {
  const { data: jpeg, width, height } = textImage(text, "image/jpeg")
  const parts: Buffer[] = []
  let len = 0
  const push = (b: Buffer | string) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b
    parts.push(buf)
    len += buf.length
  }
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  const offsets: number[] = []
  push("%PDF-1.4\n")
  objs.forEach((o, i) => {
    offsets.push(len)
    push(`${i + 1} 0 obj\n${o}\nendobj\n`)
  })
  offsets.push(len)
  push(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  push(jpeg)
  push("\nendstream\nendobj\n")
  const xref = len
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return Buffer.concat(parts)
}
