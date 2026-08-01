import { Building2, Car } from "lucide-react"
import { cn } from "@/lib/utils"

type AssetType = "PROPERTY" | "VEHICLE"

const subdir: Record<AssetType, string> = { PROPERTY: "properties", VEHICLE: "vehicles" }
const placeholderIcon: Record<AssetType, React.ElementType> = { PROPERTY: Building2, VEHICLE: Car }

export function assetImageSrc(assetType: AssetType, assetId: string, imageFilename: string) {
  return `/api/files/${subdir[assetType]}/${assetId}/${imageFilename}`
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

  const Icon = placeholderIcon[assetType]
  return (
    <div className={cn("flex items-center justify-center bg-muted text-muted-foreground/40", className)}>
      <Icon className="h-8 w-8" strokeWidth={1.5} />
    </div>
  )
}
