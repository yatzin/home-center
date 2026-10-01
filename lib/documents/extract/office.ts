import { OfficeParser } from "officeparser"
import { ExtractError } from "../types"
import { officePages, type OfficeNode } from "./office-text"

// The type hint matters: .dotx is a docx template that detection doesn't know.
const FILE_TYPE = {
  ".docx": "docx", ".dotx": "docx", ".odt": "odt", ".pptx": "pptx", ".odp": "odp", ".xlsx": "xlsx", ".ods": "ods",
} as const

export async function extractOffice(data: Buffer, ext: string): Promise<string[]> {
  const fileType = FILE_TYPE[ext.toLowerCase() as keyof typeof FILE_TYPE]
  let ast: Awaited<ReturnType<typeof OfficeParser.parseOffice>>
  try {
    ast = await OfficeParser.parseOffice(data, { fileType })
  } catch {
    throw new ExtractError("Not a readable document")
  }
  return officePages(ast.content as OfficeNode[])
}

export async function extractDoc(data: Buffer): Promise<string[]> {
  const { default: WordExtractor } = await import("word-extractor")
  try {
    const doc = await new WordExtractor().extract(data)
    return [doc.getBody()]
  } catch {
    throw new ExtractError("Not a readable Word document")
  }
}
