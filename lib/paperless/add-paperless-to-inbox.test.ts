import { beforeEach, describe, expect, it, vi } from "vitest"

const createInboxItem = vi.fn()
const discardInboxItem = vi.fn()
vi.mock("@/lib/actions/inbox", () => ({
  createInboxItem: (...a: unknown[]) => createInboxItem(...a),
  discardInboxItem: (...a: unknown[]) => discardInboxItem(...a),
}))

import { addPaperlessToInbox } from "@/components/inbox/add-paperless-to-inbox"

const asset = { assetType: "VEHICLE" as const, assetId: "v1" }

beforeEach(() => {
  createInboxItem.mockReset().mockResolvedValue({ success: true, id: "item1" })
  discardInboxItem.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal("fetch", vi.fn())
})

describe("addPaperlessToInbox", () => {
  it("creates the item, imports into it and returns its id", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ attachmentId: "a1" }), { status: 200 }))
    expect(await addPaperlessToInbox(42, asset)).toBe("item1")
    expect(createInboxItem).toHaveBeenCalledWith(asset)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe("/api/paperless/import")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ documentId: 42, recordType: "INBOX", recordId: "item1" })
    expect(discardInboxItem).not.toHaveBeenCalled()
  })
  it("discards the item and rethrows the server's error", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Document not found" }), { status: 404 }))
    await expect(addPaperlessToInbox(42)).rejects.toThrow("Document not found")
    expect(discardInboxItem).toHaveBeenCalledWith("item1")
  })
  it("discards when the request itself fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network"))
    await expect(addPaperlessToInbox(42)).rejects.toThrow()
    expect(discardInboxItem).toHaveBeenCalledWith("item1")
  })
})
