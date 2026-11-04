import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { PAPERLESS_SETTINGS_ID, paperlessRoleAllowed } from "./config"

export type PaperlessUiState = { available: boolean; linkBase: string | null }

/**
 * What the pages need to know: whether to offer "Choose from Paperless" and where to link.
 * Read-only: no row is created and the token is never decrypted, only checked for presence.
 * Once per request.
 */
export const loadPaperlessUiState = cache(async (role: string | undefined): Promise<PaperlessUiState> => {
  const row = await prisma.paperlessSettings.findUnique({ where: { id: PAPERLESS_SETTINGS_ID } })
  const available = Boolean(
    row && row.enabled && row.baseUrl && row.apiTokenEnc && paperlessRoleAllowed(row.access, role),
  )
  return { available, linkBase: available && row ? row.baseUrl : null }
})
