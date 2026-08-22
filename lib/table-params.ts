export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

export type SortDir = "asc" | "desc"

// Maps a URL sort token to the Prisma orderBy fragments it stands for. This has
// to stay a whitelist: `sort` arrives from the query string and ends up as an
// orderBy key, so unvalidated values must never reach Prisma.
//
// A token can expand to several fragments, which is how derived columns work —
// warranty "status" is computed in JS from expirationDate, but status order and
// expiration order are the same sequence, so the token maps onto the date.
export type SortMap<TOrderBy> = Record<string, (dir: SortDir) => TOrderBy[]>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function parsePageSize(value: string | string[] | undefined) {
  const n = Number(first(value))
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE
}

export function parseTableParams<TOrderBy>({
  searchParams,
  sortable,
  defaultSort,
  defaultDir = "desc",
  tiebreaker,
}: {
  searchParams: Record<string, string | string[] | undefined>
  sortable: SortMap<TOrderBy>
  defaultSort: string
  defaultDir?: SortDir
  // Appended to every sort. Without a unique tiebreaker, rows sharing a sort
  // value have no guaranteed order between queries, so the same row can show up
  // on two pages while another never appears at all.
  tiebreaker: TOrderBy
}) {
  const rawSort = first(searchParams.sort)
  const sort = rawSort && sortable[rawSort] ? rawSort : defaultSort

  const rawDir = first(searchParams.dir)
  const dir: SortDir = rawDir === "asc" || rawDir === "desc" ? rawDir : defaultDir

  const per = parsePageSize(searchParams.per)

  const rawPage = Number(first(searchParams.page))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1

  return {
    page,
    per,
    sort,
    dir,
    orderBy: [...sortable[sort](dir), tiebreaker],
    skip: (page - 1) * per,
    take: per,
  }
}

export function pageCountOf(total: number, per: number) {
  return Math.max(1, Math.ceil(total / per))
}

// Rebuilds the current query string with some params replaced. Used to redirect
// a request for page 9 of a 3-page result onto page 3, so the URL keeps
// describing what is actually on screen.
export function withParams(
  searchParams: Record<string, string | string[] | undefined>,
  changes: Record<string, string | number | undefined>
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    const v = first(value)
    if (v) params.set(key, v)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "") params.delete(key)
    else params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}
