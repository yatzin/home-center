export type PaperlessBadgeInput = {
  source: string
  paperlessId: number | null
  paperlessUpdatedAt: Date | string | null
  paperlessLinkStatus: "OK" | "MISSING" | null
}

/** Pure: what the badge on an attachment row shows. Only Paperless attachments get one. */
export function paperlessBadgeInfo(a: PaperlessBadgeInput): { show: boolean; updatedOn: Date | null; broken: boolean } {
  if (a.source !== "PAPERLESS") return { show: false, updatedOn: null, broken: false }
  let updatedOn: Date | null = null
  if (a.paperlessUpdatedAt) {
    const d = new Date(a.paperlessUpdatedAt)
    if (!Number.isNaN(d.getTime())) updatedOn = d
  }
  return { show: true, updatedOn, broken: a.paperlessLinkStatus === "MISSING" }
}

/** `<linkBase>/documents/<id>/details`, or null when either part is missing. */
export function paperlessLinkHref(linkBase: string | null, paperlessId: number | null): string | null {
  if (!linkBase || paperlessId === null) return null
  return `${linkBase.replace(/\/+$/, "")}/documents/${paperlessId}/details`
}

/** A bare positive integer, or a URL containing `/documents/<digits>`. Anything else is null. */
export function paperlessIdFromLink(text: string): number | null {
  const t = text.trim()
  const digits = /^\d+$/.test(t) ? t : /\/documents\/(\d+)(?:[/?#]|$)/.exec(t)?.[1]
  if (!digits) return null
  const n = Number(digits)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
