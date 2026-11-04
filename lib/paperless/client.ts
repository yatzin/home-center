// Paperless-ngx API client. The token is only ever sent in the Authorization
// header and never appears in errors. Redirects are never followed.

// Document `versions[]` (with per-version checksum) and root_document need API v9+.
export const MIN_API_VERSION = 9

const BATCH_SIZE = 50
const NAMED_LIMIT = 100
const DEFAULT_TIMEOUT_MS = 15_000

export type PaperlessErrorKind =
  | "unreachable"
  | "unauthorized"
  | "not_found"
  | "bad_response"
  | "too_large"

const MESSAGES: Record<PaperlessErrorKind, string> = {
  unreachable: "Paperless server is unreachable",
  unauthorized: "Paperless rejected the access token",
  not_found: "Paperless document not found",
  bad_response: "Paperless returned an unexpected response",
  too_large: "Paperless file is too large",
}

export class PaperlessError extends Error {
  kind: PaperlessErrorKind
  constructor(kind: PaperlessErrorKind) {
    super(MESSAGES[kind])
    this.name = "PaperlessError"
    this.kind = kind
  }
}

export type PaperlessVersion = { id: number; checksum: string; isRoot: boolean; added: string }

export type PaperlessDoc = {
  id: number
  rootId: number
  title: string
  originalFileName: string
  mimeType: string
  content: string
  pageCount: number | null
  modified: string
  deletedAt: string | null
  versions: PaperlessVersion[]
}

export type PaperlessSearchResult = { id: number; title: string; mimeType: string; created: string }

export type PaperlessNamed = { id: number; name: string }

export type PaperlessClient = {
  status(): Promise<{ version: string }>
  search(q: {
    query?: string
    tag?: number
    documentType?: number
    page?: number
  }): Promise<{ count: number; results: PaperlessSearchResult[] }>
  getDocument(id: number): Promise<PaperlessDoc>
  getDocuments(ids: number[]): Promise<PaperlessDoc[]>
  downloadOriginal(
    id: number,
    maxBytes: number,
    versionId?: number,
  ): Promise<{ bytes: Buffer; fileName: string }>
  thumb(id: number): Promise<{ bytes: Buffer; contentType: string }>
  tags(q?: { name?: string }): Promise<PaperlessNamed[]>
  documentTypes(q?: { name?: string }): Promise<PaperlessNamed[]>
}

export function normalizeBaseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error("Invalid Paperless URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Paperless URL must start with http:// or https://")
  }
  if (url.username || url.password) {
    throw new Error("Paperless URL must not contain credentials")
  }
  return url.origin + url.pathname.replace(/\/+$/, "")
}

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function mapVersion(v: unknown): PaperlessVersion {
  if (!isObj(v) || typeof v.id !== "number") throw new PaperlessError("bad_response")
  return {
    id: v.id,
    checksum: str(v.checksum),
    isRoot: v.is_root === true,
    added: str(v.added),
  }
}

function mapDoc(raw: unknown): PaperlessDoc {
  if (!isObj(raw) || typeof raw.id !== "number") throw new PaperlessError("bad_response")
  return {
    id: raw.id,
    rootId: typeof raw.root_document === "number" ? raw.root_document : raw.id,
    title: str(raw.title),
    originalFileName: str(raw.original_file_name),
    mimeType: str(raw.mime_type),
    content: str(raw.content),
    pageCount: typeof raw.page_count === "number" ? raw.page_count : null,
    modified: str(raw.modified),
    deletedAt: typeof raw.deleted_at === "string" ? raw.deleted_at : null,
    versions: Array.isArray(raw.versions) ? raw.versions.map(mapVersion) : [],
  }
}

const DOC_FIELDS =
  "id,root_document,title,original_file_name,mime_type,content,page_count,modified,deleted_at,versions"

function parseFileName(header: string | null, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*\s*=\s*(?:utf-8|UTF-8)''([^;]+)/.exec(header)
  if (star) {
    try {
      const name = decodeURIComponent(star[1].trim())
      if (name) return name
    } catch {
      // fall through to plain filename
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/.exec(header) ?? /filename\s*=\s*([^;]+)/.exec(header)
  const name = plain?.[1]?.trim()
  return name || fallback
}

export function createPaperlessClient(opts: {
  baseUrl: string
  token: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): PaperlessClient {
  const base = normalizeBaseUrl(opts.baseUrl)
  const doFetch = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Runs `fn` with the response under one timeout that also covers body reads.
  async function call<T>(
    path: string,
    accept: string,
    fn: (res: Response) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let res: Response
      try {
        res = await doFetch(base + path, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Authorization: `Token ${opts.token}`,
            Accept: accept,
          },
        })
      } catch {
        throw new PaperlessError("unreachable")
      }
      // Redirects (login page, or anywhere else) are never followed.
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        await res.body?.cancel().catch(() => {})
        throw new PaperlessError("unauthorized")
      }
      if (res.status === 401 || res.status === 403) {
        await res.body?.cancel().catch(() => {})
        throw new PaperlessError("unauthorized")
      }
      if (res.status === 404) {
        await res.body?.cancel().catch(() => {})
        throw new PaperlessError("not_found")
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {})
        throw new PaperlessError("bad_response")
      }
      try {
        return await fn(res)
      } catch (e) {
        if (e instanceof PaperlessError) throw e
        throw new PaperlessError(controller.signal.aborted ? "unreachable" : "bad_response")
      }
    } finally {
      clearTimeout(timer)
    }
  }

  const jsonAccept = `application/json; version=${MIN_API_VERSION}`

  async function getJson(path: string, check?: (res: Response) => void): Promise<unknown> {
    return call(path, jsonAccept, async (res) => {
      check?.(res)
      let text: string
      try {
        text = await res.text()
      } catch (e) {
        if (e instanceof PaperlessError) throw e
        throw new PaperlessError("unreachable")
      }
      try {
        return JSON.parse(text) as unknown
      } catch {
        throw new PaperlessError("bad_response")
      }
    })
  }

  async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
    const declared = Number(res.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel().catch(() => {})
      throw new PaperlessError("too_large")
    }
    if (!res.body) return Buffer.alloc(0)
    const reader = res.body.getReader()
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        throw new PaperlessError("too_large")
      }
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks, total)
  }

  async function getDocuments(ids: number[]): Promise<PaperlessDoc[]> {
    const out: PaperlessDoc[] = []
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE)
      const params = new URLSearchParams({
        id__in: chunk.join(","),
        page_size: String(chunk.length),
        fields: DOC_FIELDS,
      })
      const body = await getJson(`/api/documents/?${params}`)
      if (!isObj(body) || !Array.isArray(body.results)) throw new PaperlessError("bad_response")
      for (const r of body.results) out.push(mapDoc(r))
    }
    return out
  }

  async function listNamed(path: string, q?: { name?: string }): Promise<PaperlessNamed[]> {
    const params = new URLSearchParams({ page_size: String(NAMED_LIMIT), ordering: "name" })
    if (q?.name) params.set("name__icontains", q.name)
    const body = await getJson(`${path}?${params}`)
    if (!isObj(body) || !Array.isArray(body.results)) throw new PaperlessError("bad_response")
    return body.results.slice(0, NAMED_LIMIT).map((r) => {
      if (!isObj(r) || typeof r.id !== "number" || typeof r.name !== "string") {
        throw new PaperlessError("bad_response")
      }
      return { id: r.id, name: r.name }
    })
  }

  return {
    async status() {
      const body = await getJson("/api/status/", (res) => {
        const v = Number(res.headers.get("x-api-version"))
        if (Number.isFinite(v) && res.headers.get("x-api-version") && v < MIN_API_VERSION) {
          throw new PaperlessError("bad_response")
        }
      })
      if (!isObj(body) || typeof body.pngx_version !== "string") {
        throw new PaperlessError("bad_response")
      }
      return { version: body.pngx_version }
    },

    async search(q) {
      const params = new URLSearchParams({ fields: "id,title,mime_type,created" })
      if (q.query) params.set("query", q.query)
      if (q.tag !== undefined) params.set("tags__id__all", String(q.tag))
      if (q.documentType !== undefined) params.set("document_type__id", String(q.documentType))
      if (q.page !== undefined) params.set("page", String(q.page))
      const body = await getJson(`/api/documents/?${params}`)
      if (!isObj(body) || typeof body.count !== "number" || !Array.isArray(body.results)) {
        throw new PaperlessError("bad_response")
      }
      return {
        count: body.count,
        results: body.results.map((r) => {
          if (!isObj(r) || typeof r.id !== "number") throw new PaperlessError("bad_response")
          return {
            id: r.id,
            title: str(r.title),
            mimeType: str(r.mime_type),
            created: str(r.created),
          }
        }),
      }
    },

    async getDocument(id) {
      const params = new URLSearchParams({ fields: DOC_FIELDS })
      return mapDoc(await getJson(`/api/documents/${id}/?${params}`))
    },

    getDocuments,

    async downloadOriginal(id, maxBytes, versionId) {
      const params = new URLSearchParams({ original: "true" })
      if (versionId !== undefined) params.set("version", String(versionId))
      return call(`/api/documents/${id}/download/?${params}`, "*/*", async (res) => ({
        bytes: await readCapped(res, maxBytes),
        fileName: parseFileName(res.headers.get("content-disposition"), `document-${id}`),
      }))
    },

    async thumb(id) {
      return call(`/api/documents/${id}/thumb/`, "*/*", async (res) => ({
        bytes: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
      }))
    },

    tags: (q) => listNamed("/api/tags/", q),
    documentTypes: (q) => listNamed("/api/document_types/", q),
  }
}
