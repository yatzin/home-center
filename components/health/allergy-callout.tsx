import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { ALLERGY_SEVERITIES, labelFor } from "@/lib/health"
import type { Allergy } from "@/app/generated/prisma/client"

// Always visible in the aside, never behind a tab: it is the first thing anyone
// treating this person needs. Severity is spelled out, not colour-only.
export function AllergyCallout({ allergies }: { allergies: Allergy[] }) {
  const severe = allergies.some((a) => a.severity === "SEVERE")
  return (
    <div
      className={cn("rounded-lg border p-3 text-sm", severe ? "border-destructive/50 bg-destructive/10" : "bg-card")}
      role={severe ? "alert" : undefined}
    >
      <div className={cn("flex items-center gap-1.5 font-semibold", severe && "text-destructive")}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Allergies
      </div>
      {allergies.length === 0 ? (
        <p className="mt-1 text-muted-foreground">None recorded</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {allergies.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-2">
              <span className={cn(a.severity === "SEVERE" && "font-semibold")}>{a.substance}</span>
              <span className="text-right text-xs text-muted-foreground">
                {labelFor(ALLERGY_SEVERITIES, a.severity)}
                {a.reaction ? ` · ${a.reaction}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
