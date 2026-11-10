"use client"

import { useRouter } from "next/navigation"
import type { ComponentProps } from "react"
import { inInstalledTouchApp, viewerHref } from "@/lib/file-viewer"

/**
 * A link to an uploaded file. It is an ordinary new-tab link everywhere, except in an
 * installed app on a phone or tablet, where a new tab would replace the app with a bare
 * document and no way back: there it opens the in-app viewer instead (lib/file-viewer.ts).
 * The check runs on click only, so a PC browser never takes the viewer path.
 */
export function FileLink({ href, name, onClick, ...rest }: Omit<ComponentProps<"a">, "href" | "target" | "rel"> & { href?: string; name: string }) {
  const router = useRouter()
  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onClick?.(e)
        // Leave modified clicks, and anything a caller already handled, alone.
        if (!href || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (!inInstalledTouchApp(window)) return
        e.preventDefault()
        router.push(viewerHref(href, name))
      }}
    />
  )
}
