"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Camera, X, Loader2 } from "lucide-react"
import { AssetImage } from "./asset-image"
import { cn } from "@/lib/utils"

type AssetType = "PROPERTY" | "VEHICLE"

const urlSegment: Record<AssetType, string> = { PROPERTY: "properties", VEHICLE: "vehicles" }

export function AssetImageUploader({
  assetType,
  assetId,
  imageFilename,
  alt,
}: {
  assetType: AssetType
  assetId: string
  imageFilename: string | null
  alt: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch(`/api/assets/${urlSegment[assetType]}/${assetId}/image`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Upload failed.")
        return
      }
      toast.success("Photo updated.")
      router.refresh()
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function handleRemove() {
    setBusy(true)
    try {
      const res = await fetch(`/api/assets/${urlSegment[assetType]}/${assetId}/image`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Couldn't remove photo.")
        return
      }
      toast.success("Photo removed.")
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group relative h-48 w-full overflow-hidden rounded-xl border border-border/60 shadow-sm sm:h-56">
      <AssetImage assetType={assetType} assetId={assetId} imageFilename={imageFilename} alt={alt} className="h-full w-full" />

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
          busy && "opacity-100"
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-150 hover:bg-white/20"
            >
              <Camera className="h-3.5 w-3.5" /> {imageFilename ? "Change photo" : "Add photo"}
            </button>
            {imageFilename && (
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors duration-150 hover:bg-destructive/80"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
