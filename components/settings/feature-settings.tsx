"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { updateFeatureSettings } from "@/lib/actions/feature-settings"

type Values = { healthEnabled: boolean }

export function FeatureSettings({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial)
  const [pending, start] = useTransition()

  function save(next: Values) {
    const previous = values
    setValues(next)
    start(async () => {
      const r = await updateFeatureSettings(next)
      if ("error" in r) {
        setValues(previous)
        toast.error(r.error)
        return
      }
      toast.success(next.healthEnabled ? "Health turned on." : "Health turned off.")
    })
  }

  const on = values.healthEnabled

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2">
          Health
          {on ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>
          People, providers and insurance, with everyone&apos;s visits, reminders, warranties and health records.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={on}
            disabled={pending}
            onChange={(e) => save({ healthEnabled: e.target.checked })}
          />
          Show the Health section
        </label>
        <p className="ml-6 text-xs text-muted-foreground">
          Turned off, it disappears from the menu, the dashboard, lists, search, notifications and the assistant. Nothing
          is deleted — turn it back on and it all returns.
        </p>
      </CardContent>
    </Card>
  )
}
