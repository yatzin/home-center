import { describe, expect, it } from "vitest"
import { splitSearchQuery } from "./search-terms"

describe("splitSearchQuery", () => {
  it("treats a bare type word as a request to list that type", () => {
    expect(splitSearchQuery("vehicle")).toEqual({ words: [], types: ["vehicle"] })
    expect(splitSearchQuery("Vehicles")).toEqual({ words: [], types: ["vehicle"] })
    expect(splitSearchQuery("all properties")).toEqual({ words: [], types: ["property"] })
  })

  it("keeps name words as text and type words as filters", () => {
    expect(splitSearchQuery("powertrain warranty")).toEqual({ words: ["powertrain"], types: ["warranty"] })
    expect(splitSearchQuery("honda civic")).toEqual({ words: ["honda", "civic"], types: [] })
  })

  it("drops filler and one-letter words", () => {
    expect(splitSearchQuery("the furnace a")).toEqual({ words: ["furnace"], types: [] })
  })
})
