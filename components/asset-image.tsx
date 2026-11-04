import { cn } from "@/lib/utils"
import { assetSegment, assetIcon } from "@/lib/assets"
import { firstNameOf, softColorOf } from "@/lib/asset-visuals"
import type { AssetType } from "@/app/generated/prisma/client"

/** "thumb" is a small WebP copy for lists and cards; "full" is the original upload. */
export type AssetImageSize = "thumb" | "full"

export function assetImageSrc(assetType: AssetType, assetId: string, imageFilename: string, size: AssetImageSize = "full") {
  const base = `/api/files/${assetSegment[assetType]}/${assetId}/${imageFilename}`
  return size === "thumb" ? `${base}?size=thumb` : base
}

export function AssetImage({
  assetType,
  assetId,
  imageFilename,
  alt,
  className,
  size = "thumb",
}: {
  assetType: AssetType
  assetId: string
  imageFilename: string | null
  alt: string
  className?: string
  /** Lists and cards default to the thumbnail; pass "full" where the photo is the point (detail page, report). */
  size?: AssetImageSize
}) {
  if (imageFilename) {
    // eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route; next/image can't optimize it usefully here
    return <img src={assetImageSrc(assetType, assetId, imageFilename, size)} alt={alt} loading="lazy" decoding="async" className={cn("object-cover", className)} />
  }

  // People without a photo show a first-name tile instead of a generic icon,
  // matching the dashboard's thumbnail treatment.
  if (assetType === "PERSON" && alt) {
    return (
      <div className={cn("flex items-center justify-center px-1 text-center", className)} style={softColorOf(assetId)}>
        {firstNameOf(alt)}
      </div>
    )
  }

  const Icon = assetIcon[assetType]
  return (
    <div className={cn("flex items-center justify-center bg-muted text-muted-foreground/40", className)}>
      <Icon className="h-8 w-8" strokeWidth={1.5} />
    </div>
  )
}
