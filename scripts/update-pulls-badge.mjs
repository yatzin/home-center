// Writes docs/badges/pulls.json for the shields.io "endpoint" badge.
//
// GHCR has no public API or badge service for pull counts, so this reads the
// "Total downloads" figure from the public package page. If GitHub changes that
// page the script fails loudly and leaves the last good JSON in place.
//
//   node scripts/update-pulls-badge.mjs
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const PAGE = "https://github.com/yatzin/home-center/pkgs/container/homecenter"
const OUT = path.join("docs", "badges", "pulls.json")

function parseTotalDownloads(html) {
  const m = html.match(/Total downloads<\/span>\s*<h3[^>]*title="(\d+)"/)
  return m ? Number(m[1]) : null
}

function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return String(n)
}

async function main() {
  const res = await fetch(PAGE, { headers: { "user-agent": "homecenter-badge-updater" } })
  if (!res.ok) throw new Error(`GET ${PAGE} -> ${res.status}`)
  const total = parseTotalDownloads(await res.text())
  if (total === null || !Number.isFinite(total) || total <= 0) {
    throw new Error("Could not find a download count on the package page (layout changed?)")
  }
  const badge = { schemaVersion: 1, label: "docker pulls", message: formatCount(total), color: "2496ED" }
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(badge, null, 2) + "\n")
  console.log(`${total} pulls -> ${badge.message}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
