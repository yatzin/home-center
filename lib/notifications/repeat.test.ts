import { describe, expect, it } from "vitest"
import { decide, type Prior } from "./repeat"

const prior = (over: Partial<Prior> = {}): Prior => ({
  id: "n1",
  cycleKey: "2026-10-01",
  stage: "REACHED",
  isRead: false,
  dismissedAt: null,
  createdAt: new Date("2026-09-20"),
  ...over,
})

describe("decide — ONCE", () => {
  it("creates the first notification of a cycle", () => {
    expect(decide("ONCE", "REACHED", "2026-10-01", [])).toEqual({ action: "create" })
  })
  it("stays quiet once one exists, read or not", () => {
    expect(decide("ONCE", "REACHED", "2026-10-01", [prior({ isRead: true })])).toEqual({ action: "skip" })
  })
  it("does not raise again on the due date", () => {
    expect(decide("ONCE", "DUE", "2026-10-01", [prior()])).toEqual({ action: "skip" })
  })
  it("starts over for a new cycle", () => {
    expect(decide("ONCE", "REACHED", "2027-01-01", [prior({ isRead: true, dismissedAt: new Date() })])).toEqual({ action: "create" })
  })
})

describe("decide — REACHED_AND_DUE", () => {
  it("creates one when the warning window is reached", () => {
    expect(decide("REACHED_AND_DUE", "REACHED", "2026-10-01", [])).toEqual({ action: "create" })
  })
  it("does not repeat the warning", () => {
    expect(decide("REACHED_AND_DUE", "REACHED", "2026-10-01", [prior({ isRead: true, dismissedAt: new Date() })])).toEqual({ action: "skip" })
  })
  it("creates a second one on the due date, even if the first was dismissed", () => {
    expect(decide("REACHED_AND_DUE", "DUE", "2026-10-01", [prior({ dismissedAt: new Date() })])).toEqual({ action: "create" })
  })
  it("does not repeat the due-date one", () => {
    expect(decide("REACHED_AND_DUE", "DUE", "2026-10-01", [prior(), prior({ id: "n2", stage: "DUE", isRead: true })])).toEqual({ action: "skip" })
  })
  it("first seen on the due date creates just that one", () => {
    expect(decide("REACHED_AND_DUE", "DUE", "2026-10-01", [])).toEqual({ action: "create" })
  })
})

describe("decide — UNTIL_DISMISSED", () => {
  it("creates the first one", () => {
    expect(decide("UNTIL_DISMISSED", "REACHED", "2026-10-01", [])).toEqual({ action: "create" })
  })
  it("leaves an unread one alone", () => {
    expect(decide("UNTIL_DISMISSED", "REACHED", "2026-10-01", [prior()])).toEqual({ action: "skip" })
  })
  it("brings back the latest one once it has been read", () => {
    const older = prior({ id: "old", isRead: true, createdAt: new Date("2026-09-01") })
    const newer = prior({ id: "new", isRead: true, createdAt: new Date("2026-09-25") })
    expect(decide("UNTIL_DISMISSED", "DUE", "2026-10-01", [older, newer])).toEqual({ action: "resurface", id: "new" })
  })
  it("stops for good once dismissed", () => {
    expect(decide("UNTIL_DISMISSED", "DUE", "2026-10-01", [prior({ isRead: true, dismissedAt: new Date() })])).toEqual({ action: "skip" })
  })
})

describe("decide — notifications from before cycles were tracked", () => {
  it("an unread legacy one still holds off a new one", () => {
    expect(decide("REACHED_AND_DUE", "DUE", "2026-10-01", [prior({ cycleKey: null, stage: null })])).toEqual({ action: "skip" })
  })
  it("a read legacy one is ignored", () => {
    expect(decide("ONCE", "REACHED", "2026-10-01", [prior({ cycleKey: null, stage: null, isRead: true })])).toEqual({ action: "create" })
  })
})
