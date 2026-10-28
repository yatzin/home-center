import { cn } from "@/lib/utils"
import { initialsOf, firstNameOf, softColorOf } from "@/lib/asset-visuals"
import type { AssetType } from "@/app/generated/prisma/client"

type Thumbnail = { assetType: AssetType; assetId: string; imageFilename: string | null; name: string }

// A soft-colored initials tile in place of a photo, for anything without one —
// used everywhere a thumbnail would otherwise be, not just the hero rows. For
// people specifically, the first name reads better than two letters.
export function InitialsTile({ thumbnail, className }: { thumbnail: Thumbnail; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center px-1 text-center", className)} style={softColorOf(thumbnail.assetId)}>
      {thumbnail.assetType === "PERSON" ? firstNameOf(thumbnail.name) : initialsOf(thumbnail.name)}
    </div>
  )
}
