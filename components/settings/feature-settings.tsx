"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldHelp } from "@/components/ui/field-help"
import { updateFeatureSettings } from "@/lib/actions/feature-settings"
import { cn } from "@/lib/utils"

type Values = { healthEnabled: boolean; roomsEnabled: boolean; equipmentTabEnabled: boolean; propertyFilterEnabled: boolean; propertyEquipmentCostsEnabled: boolean }
type Key = keyof Values

const FEATURE_NAMES: Record<Key, string> = {
  healthEnabled: "Health",
  roomsEnabled: "Rooms",
  equipmentTabEnabled: "Equipment tab",
  propertyFilterEnabled: "Property filter",
  propertyEquipmentCostsEnabled: "Equipment in property costs",
}

type Row = { key: Key; title: string; description: string; help: string }
type Group = { title: string; description: string; rows: Row[] }

// One line per setting; the longer explanation (and "nothing is deleted") is in the help popover.
const GROUPS: Group[] = [
  {
    title: "Sections",
    description: "Parts of the site you can hide. Nothing is deleted; turn one back on and it all returns.",
    rows: [
      { key: "healthEnabled", title: "Health", description: "People, providers and health insurance, with their visits, reminders and records.", help: "features.health" },
      { key: "roomsEnabled", title: "Rooms", description: "Rooms inside properties: paint, flooring, photos.", help: "features.rooms" },
    ],
  },
  {
    title: "Properties and equipment",
    description: "What a property page shows and adds up.",
    rows: [
      { key: "equipmentTabEnabled", title: "Equipment tab", description: "List and edit a property's and each room's equipment in place.", help: "features.equipment-tab" },
      { key: "propertyEquipmentCostsEnabled", title: "Equipment in property costs", description: "A property's Cost panel also counts its equipment's service costs.", help: "features.property-equipment-costs" },
    ],
  },
  {
    title: "Navigation",
    description: "How you move around the site.",
    rows: [
      { key: "propertyFilterEnabled", title: "Property filter", description: "A top-bar dropdown that narrows the site to one property.", help: "features.property-filter" },
    ],
  },
]

/** A toggle: the row shows the state, so there is no separate On/Off badge. */
function Switch({ checked, disabled, onChange, labelledBy }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-primary" : "bg-input"
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  )
}

export function FeatureSettings({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial)
  const [pending, start] = useTransition()
  // The row being saved: only it is locked, so the rest of the page stays usable.
  const [saving, setSaving] = useState<Key | null>(null)

  function toggle(key: Key, next: boolean) {
    const previous = values
    const updated = { ...values, [key]: next }
    setValues(updated)
    setSaving(key)
    start(async () => {
      const r = await updateFeatureSettings(updated)
      setSaving(null)
      if ("error" in r) {
        setValues(previous)
        toast.error(r.error)
        return
      }
      toast.success(`${FEATURE_NAMES[key]} turned ${next ? "on" : "off"}.`)
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      {GROUPS.map((group) => (
        <Card key={group.title} className="py-5">
          <CardHeader className="px-5">
            <CardTitle>{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <ul className="divide-y rounded-md border">
              {group.rows.map((row) => {
                const labelId = `feature-${row.key}`
                return (
                  <li key={row.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span id={labelId} className="text-sm font-medium">{row.title}</span>
                        <FieldHelp id={row.help} />
                      </div>
                      <p className="text-xs text-muted-foreground">{row.description}</p>
                    </div>
                    <Switch
                      checked={values[row.key]}
                      disabled={pending && saving === row.key}
                      onChange={(next) => toggle(row.key, next)}
                      labelledBy={labelId}
                    />
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      <p className="text-sm text-muted-foreground">
        Want HomeCenter on your Home Screen?{" "}
        <Link href="/settings/install" className="font-medium text-primary underline-offset-4 hover:underline">
          How to install →
        </Link>
      </p>
    </div>
  )
}
