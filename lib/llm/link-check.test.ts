import { describe, expect, it } from "vitest"
import { unlink, unverifiedLinks } from "./link-check"

const seen = ['{"rows":[{"id":"real1","href":"/assets/vehicles/real1"},{"id":"m1","href":"/assets/people/p1"}]}']

describe("unverifiedLinks", () => {
  it("flags internal links no tool returned this turn", () => {
    const text = "The [Work Truck](/assets/vehicles/fake9) and [Daily Driver](/assets/vehicles/real1)."
    expect(unverifiedLinks(text, seen)).toEqual(["/assets/vehicles/fake9"])
  })
  it("flags made-up page paths even when the id is real", () => {
    expect(unverifiedLinks("[Lisinopril](/assets/medications/m1)", seen)).toEqual(["/assets/medications/m1"])
  })
  it("allows the app's fixed pages and external links", () => {
    const text = "See [costs](/costs), [providers](/providers), [vehicles](/assets/vehicles) and [docs](https://x.com/a/b)."
    expect(unverifiedLinks(text, [])).toEqual([])
  })
  it("reports each bad link once", () => {
    expect(unverifiedLinks("[a](/assets/people/x1) [b](/assets/people/x1)", [])).toEqual(["/assets/people/x1"])
  })
})

describe("unlink", () => {
  it("keeps the label and drops the given links only", () => {
    const text = "The [Work Truck](/assets/vehicles/fake9) and [Daily Driver](/assets/vehicles/real1)."
    expect(unlink(text, ["/assets/vehicles/fake9"])).toBe("The Work Truck and [Daily Driver](/assets/vehicles/real1).")
  })
})
