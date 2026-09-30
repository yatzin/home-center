import { describe, expect, it } from "vitest"
import {
  documentAccess, groupHits, hiddenRecordTypes, isHiddenRecordType, searchDocumentsDescription, toRecordType, visibleRecordTypes,
} from "./tool-helpers"

describe("record type rules", () => {
  it("hides exactly the five health types unless health documents are on", () => {
    expect(hiddenRecordTypes(false)).toEqual(["CONDITION", "OBSERVATION", "MEDICATION", "ALLERGY", "IMMUNIZATION"])
    expect(hiddenRecordTypes(true)).toEqual([])
    expect(visibleRecordTypes(false)).toEqual(["SERVICE", "WARRANTY", "MAINTENANCE", "INSURANCE"])
    expect(isHiddenRecordType("MEDICATION", false)).toBe(true)
    expect(isHiddenRecordType("INSURANCE", false)).toBe(false)
    expect(isHiddenRecordType("MEDICATION", true)).toBe(false)
  })

  it("accepts the loose names models use", () => {
    expect(toRecordType("warranties", false)).toBe("WARRANTY")
    expect(toRecordType("Service records", false)).toBe("SERVICE")
    expect(toRecordType("insurance_policy", false)).toBe("INSURANCE")
    expect(toRecordType("vaccines", true)).toBe("IMMUNIZATION")
    expect(toRecordType("ALLERGY", true)).toBe("ALLERGY")
  })

  it("rejects unknown types and health types while they're hidden, listing what's allowed", () => {
    expect(() => toRecordType("receipts", false)).toThrow(/Use one of: SERVICE, WARRANTY, MAINTENANCE, INSURANCE/)
    expect(() => toRecordType("medications", false)).toThrow(/Unknown recordType/)
  })

  it("only mentions medical documents in the description when they're included", () => {
    expect(searchDocumentsDescription(false)).not.toMatch(/medical/i)
    expect(searchDocumentsDescription(true)).toMatch(/medical/i)
  })
})

describe("groupHits", () => {
  const hit = (attachmentId: string, score: number, page = 1) => ({ attachmentId, score, page, text: `${attachmentId}@${score}` })

  it("groups by file in best-score order and keeps each file's best chunks", () => {
    const groups = groupHits([hit("b", -2), hit("a", -5), hit("a", -4), hit("a", -3), hit("a", -1), hit("c", -0.5)], 2)
    expect(groups.map((g) => g.attachmentId)).toEqual(["a", "b"])
    expect(groups[0].hits.map((h) => h.score)).toEqual([-5, -4, -3])
  })
})

describe("documentAccess", () => {
  it("needs indexing and assistant access; health needs both plus its own switch", () => {
    const llm = { documentsEnabled: true, healthDocumentsEnabled: true }
    expect(documentAccess({ indexingEnabled: true }, llm)).toEqual({ enabled: true, includeHealth: true })
    expect(documentAccess({ indexingEnabled: false }, llm)).toEqual({ enabled: false, includeHealth: false })
    expect(documentAccess({ indexingEnabled: true }, { ...llm, documentsEnabled: false })).toEqual({ enabled: false, includeHealth: false })
    expect(documentAccess({ indexingEnabled: true }, { ...llm, healthDocumentsEnabled: false })).toEqual({ enabled: true, includeHealth: false })
  })
})
