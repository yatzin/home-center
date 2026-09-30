import { z } from "zod/v4"
import { prisma } from "@/lib/prisma"
import { loadAssetIndex } from "@/lib/assets-server"
import { searchIndex } from "@/lib/documents/indexer-server"
import { attachmentIdsForAsset, countNotIndexed, loadDocumentRefs, OWNER_SELECT } from "@/lib/documents/scope"
import { describeAttachment } from "@/lib/documents/owner"
import { parseSearch } from "@/lib/documents/fts-query"
import { passage } from "@/lib/documents/passage"
import { readWindow } from "@/lib/documents/read-window"
import { splitPages } from "@/lib/documents/normalize"
import {
  groupHits, hiddenRecordTypes, isHiddenRecordType, READ_DOCUMENT_DESCRIPTION, searchDocumentsDescription, STATUS_NOTE,
  toRecordType, visibleRecordTypes,
} from "@/lib/documents/tool-helpers"
import { ToolInputError } from "../query"
import { compact } from "../serialize"
import { defineTool, type RegisteredTool } from "./registry"
import { ASSET_ARG, assetLinkRef, findAsset, toAssetType } from "./shortcuts"

// search_documents / read_document. Built per request because whether health
// files are included changes both what the tools can return and what their
// descriptions admit exists. The filter is applied in code, never left to the model.

const SEARCH_POOL = 60
const DEFAULT_LIMIT = 6

export function documentTools(includeHealth: boolean): RegisteredTool[] {
  const hidden = hiddenRecordTypes(includeHealth)

  const search = defineTool({
    name: "search_documents",
    description: searchDocumentsDescription(includeHealth),
    schema: z.object({
      query: z.string().min(1).describe("Key words, a model or part number, or a \"quoted phrase\" — e.g. 'filter size', 'deductible', 'WDT730PAHZ0'."),
      asset: z.string().optional().describe(ASSET_ARG),
      assetType: z.string().optional().describe("PROPERTY, VEHICLE, EQUIPMENT or PERSON, if known."),
      recordType: z.string().optional().describe(`Only files attached to one kind of record: ${visibleRecordTypes(includeHealth).join(", ")}.`),
      limit: z.number().int().min(1).max(8).optional().describe(`Most files to return, default ${DEFAULT_LIMIT}.`),
    }),
    label: (a) => `Searching documents for “${a.query}”…`,
    async run(a, ctx) {
      const parsed = parseSearch(a.query)
      if (!parsed) throw new ToolInputError("Give some words to search for, e.g. 'filter size' or a model number.")
      const recordTypes = a.recordType ? [toRecordType(a.recordType, includeHealth)] : null

      let attachmentIds: string[] | null = null
      let scope: Record<string, unknown> = {}
      if (a.asset) {
        const found = await findAsset(a.asset, ctx, a.assetType ? [toAssetType(a.assetType)] : undefined)
        if ("reply" in found) return found.reply
        attachmentIds = await attachmentIdsForAsset(found.asset.type, found.asset.id)
        scope = { for: assetLinkRef(found.asset) }
      }

      const hits = await (await searchIndex()).search(parsed.match, {
        attachmentIds, recordTypes, excludeRecordTypes: hidden, limit: SEARCH_POOL,
      })
      const groups = groupHits(hits, a.limit ?? DEFAULT_LIMIT)
      const [refs, index, notIndexed] = await Promise.all([
        loadDocumentRefs(groups.map((g) => g.attachmentId)),
        loadAssetIndex(),
        countNotIndexed({ attachmentIds, recordTypes, hidden }),
      ])

      const documents = groups.flatMap((g) => {
        const ref = refs.get(g.attachmentId)
        // Deleted since it was indexed (reconcile drops its chunks), or hidden —
        // the index filter already excludes hidden types; this is the second lock.
        if (!ref || !ref.text || isHiddenRecordType(ref.recordType, includeHealth)) return []
        const pages = ref.text.pageCount ?? 1
        return [compact({
          attachmentId: ref.attachmentId,
          fileName: ref.fileName,
          fileHref: ref.fileHref,
          record: ref.record,
          asset: ref.asset ? compact({ type: ref.asset.type, name: index.names[ref.asset.type]?.[ref.asset.id] }) : null,
          pages: pages > 1 ? pages : null,
          passages: g.hits.map((h) => compact({ page: pages > 1 ? h.page : null, text: passage(h.text, parsed.terms) })),
        })]
      })

      return {
        ...scope,
        documents,
        ...(notIndexed ? { notIndexed } : {}),
        ...(documents.length ? {} : { note: "No document text matched. Try other words or a model number, or search without the asset filter." }),
      }
    },
  })

  const read = defineTool({
    name: "read_document",
    description: READ_DOCUMENT_DESCRIPTION,
    schema: z.object({
      attachmentId: z.string().min(1).describe("From search_documents."),
      fromPage: z.number().int().min(1).optional().describe("Page to start at, default 1."),
      offset: z.number().int().min(0).optional().describe("Only to continue a cut page: next.offset from the previous result."),
    }),
    label: () => "Reading a document…",
    async run(a) {
      const row = await prisma.attachment.findUnique({
        where: { id: a.attachmentId },
        select: { ...OWNER_SELECT, text: { select: { status: true, text: true, truncated: true } } },
      })
      if (!row || isHiddenRecordType(row.recordType, includeHealth)) {
        throw new ToolInputError(`No document with id "${a.attachmentId}". Use search_documents to find one.`)
      }
      const ref = describeAttachment(row)
      const head = { fileName: ref.fileName, fileHref: ref.fileHref, record: ref.record }
      const t = row.text
      if (!t || t.status !== "DONE" || !t.text) return { ...head, status: STATUS_NOTE[t && t.status !== "DONE" ? t.status : "PENDING"] }

      const pages = splitPages(t.text)
      const fromPage = a.fromPage ?? 1
      if (fromPage > pages.length) throw new ToolInputError(`This document has ${pages.length} page${pages.length === 1 ? "" : "s"}.`)
      const w = readWindow(pages, fromPage, a.offset ?? 0)
      return {
        ...head,
        pageCount: pages.length,
        text: w.text,
        ...(w.next ? { next: w.next, note: "More text follows: call read_document again with next.fromPage and next.offset." } : {}),
        ...(t.truncated ? { truncated: "Only the first 2,000,000 characters of this file were kept when it was indexed." } : {}),
      }
    },
  })

  return [search, read]
}
