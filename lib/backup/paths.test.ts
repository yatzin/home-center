import { describe, expect, it } from "vitest"
import path from "node:path"
import { containsPath, dataDir, dbPathFromUrl, defaultBackupFolder, incomingUploadPath, safeJoin, searchIndexFile } from "./paths"

describe("paths", () => {
  const env = { DATABASE_URL: "file:/data/homecenter.db" }
  it("reads the db path from DATABASE_URL", () => expect(dbPathFromUrl(env.DATABASE_URL)).toBe(path.resolve("/data/homecenter.db")))
  it("puts backups next to the db", () => expect(defaultBackupFolder(env)).toBe(path.join(dataDir(env), "backups")))
  it("finds the search index like index-db does", () => {
    expect(searchIndexFile(env)).toBe(path.join(path.resolve("/data"), "search-index.db"))
    expect(searchIndexFile({ ...env, SEARCH_INDEX_PATH: "/x/s.db" })).toBe(path.resolve("/x/s.db"))
  })
  it("throws without DATABASE_URL", () => expect(() => dbPathFromUrl("")).toThrow("DATABASE_URL"))
})

describe("safeJoin rejects escapes", () => {
  const root = path.resolve("/data/uploads")
  it("joins a normal relative path", () => expect(safeJoin(root, "service/s1/a.pdf")).toBe(path.join(root, "service", "s1", "a.pdf")))
  it.each(["../x", "a/../../x", "/etc/passwd", "C:\\x", "a\\..\\..\\x", "", "a//b/../../.."])("rejects %s", (rel) =>
    expect(safeJoin(root, rel)).toBeNull())
})

describe("containsPath", () => {
  const work = path.resolve("/data/backup-work")
  it("is true for the dir itself and anything inside it", () => {
    expect(containsPath(work, work)).toBe(true)
    expect(containsPath(work, path.join(work, "uploads"))).toBe(true)
    expect(containsPath(work, path.join(work, "a", "b.db"))).toBe(true)
  })
  it("is false for siblings, parents and look-alike names", () => {
    expect(containsPath(work, path.resolve("/data/restore"))).toBe(false)
    expect(containsPath(work, path.resolve("/data"))).toBe(false)
    expect(containsPath(work, path.resolve("/data/backup-work-2"))).toBe(false)
    expect(containsPath(work, path.join(work, "..x"))).toBe(true) // a child literally named "..x" is inside
  })
})

describe("incomingUploadPath", () => {
  const root = path.resolve("/data/restore")
  const id = "123e4567-e89b-42d3-a456-426614174000"

  it("is the upload's file in the incoming folder, for the id the upload route makes", () => {
    expect(incomingUploadPath(root, id)).toBe(path.join(root, "incoming", `${id}.upload`))
  })

  it("is null for anything that is not a UUID, so a client string never becomes a path", () => {
    for (const bad of ["", "..", "../x", `../${id}`, `${id}/../../x`, `${id}.upload`, id.toUpperCase(), id + "x", " " + id, "a/b", "/etc/passwd", "C:\\x", `${id}\u0000`, 5, null, undefined, {}]) {
      expect(incomingUploadPath(root, bad)).toBeNull()
    }
  })
})
