import { describe, expect, it } from "vitest"
import { AssetType, ServiceCategory } from "@/app/generated/prisma/enums"
import { describeOntology, ENTITIES, ENTITY_KEYS } from "./ontology"

const FORBIDDEN = ["passwordHash", "passwordEnc", "apiKeyEnc", "imageFilename", "createdById", "createdBy", "uploadedBy", "attachments", "user", "userId"]

describe("ontology", () => {
  it("defines every key", () => {
    expect(Object.keys(ENTITIES).sort()).toEqual([...ENTITY_KEYS].sort())
  })

  it("never exposes excluded fields or relations", () => {
    for (const key of ENTITY_KEYS) {
      const def = ENTITIES[key]
      for (const name of [...Object.keys(def.fields), ...Object.keys(def.relations), ...def.keys]) {
        expect(FORBIDDEN, `${key}.${name}`).not.toContain(name)
      }
    }
  })

  it("points relations at real entities and valid fields", () => {
    for (const key of ENTITY_KEYS) {
      const def = ENTITIES[key]
      expect(def.fields[def.nameField], `${key}.nameField`).toBeDefined()
      for (const f of def.searchFields) expect(def.fields[f], `${key} search ${f}`).toBeDefined()
      expect(def.fields[def.defaultSort.field], `${key} sort`).toBeDefined()
      for (const rel of Object.values(def.relations)) {
        if (rel.kind !== "asset") expect(ENTITY_KEYS).toContain(rel.entity)
        if (rel.kind === "asset") expect(def.polymorphic).toBe(true)
        if (rel.kind === "assetChildren") expect(def.assetType).toBeDefined()
      }
    }
  })

  it("uses the Prisma enum values", () => {
    expect(ENTITIES.serviceRecord.fields.category.values).toEqual(Object.values(ServiceCategory))
    expect(ENTITIES.serviceRecord.fields.assetType.values).toEqual(Object.values(AssetType))
  })

  it("scopes notifications to the signed-in user", () => {
    expect(ENTITIES.notification.scope?.({ userId: "u1" })).toEqual({ userId: "u1" })
  })

  it("links rows to their pages", () => {
    expect(ENTITIES.vehicle.href?.({ id: "v1" })).toBe("/assets/vehicles/v1")
    expect(ENTITIES.medication.href?.({ id: "m1", personId: "p1" })).toBe("/assets/people/p1")
    expect(ENTITIES.serviceRecord.href?.({ id: "s1", assetType: "EQUIPMENT", assetId: "e1" })).toBe("/assets/equipment/e1")
    expect(ENTITIES.provider.href?.({ id: "x" })).toBe("/providers")
  })

  it("describes every entity compactly", () => {
    const text = describeOntology()
    for (const key of ENTITY_KEYS) expect(text).toContain(`- ${key}:`)
    expect(text).toContain("meterUnit(MILES|HOURS)")
    expect(text).toContain("asset→property|vehicle|equipment|person")
    expect(text).toContain("medications→medication[]")
    expect(text).not.toMatch(/passwordHash|imageFilename/)
  })
})
