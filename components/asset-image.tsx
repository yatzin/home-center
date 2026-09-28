import { cn } from "@/lib/utils"
import { assetSegment, assetIcon } from "@/lib/assets"
import { firstNameOf, softColorOf } from "@/lib/asset-visuals"
import type { AssetType } from "@/app/generated/prisma/client"

export function assetImageSrc(assetType: AssetType, assetId: string, imageFilename: string) {
  return `/api/files/${assetSegment[assetType]}/${assetId}/${imageFilename}`
}

export function AssetImage({
  assetType,
  assetId,
  imageFilename,
  alt,
  className,
}: {
  assetType: AssetType
  assetId: string
  imageFilename: string | null
  alt: string
  className?: string
}) {
  if (imageFilename) {
    // eslint-disable-next-line @next/next/no-img-element -- served from a private, auth-gated route; next/image can't optimize it usefully here
    return <img src={assetImageSrc(assetType, assetId, imageFilename)} alt={alt} className={cn("object-cover", className)} />
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
