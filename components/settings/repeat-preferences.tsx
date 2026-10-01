"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateNotificationRepeat } from "@/lib/actions/users"
import { REPEAT_OPTIONS, type NotificationRepeat } from "@/lib/notifications/repeat"

export function RepeatPreferences({ repeat }: { repeat: NotificationRepeat }) {
  const [value, setValue] = useState<NotificationRepeat>(repeat)
  const [pending, startTransition] = useTransition()

  function change(next: string | null) {
    if (!next || next === value) return
    const previous = value
    setValue(next as NotificationRepeat)
    startTransition(async () => {
      const result = await updateNotificationRepeat(next)
      if (result?.error) {
        setValue(previous) // put the control back if the server refused
        toast.error(result.error)
      } else {
        toast.success("Reminder preference saved.")
      }
    })
  }

  const hint = REPEAT_OPTIONS.find((o) => o.value === value)?.hint

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle>Repeat reminders</CardTitle>
        <CardDescription>
          How often you&apos;re reminded about the same due item, in the bell and by email. A new due
          date always starts afresh.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={value} onValueChange={change} disabled={pending}>
            <SelectTrigger className="w-80">
              {/* Base UI renders the raw value unless given a formatter. */}
              <SelectValue>
                {(v: string) => REPEAT_OPTIONS.find((o) => o.value === v)?.label ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {REPEAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </div>
      </CardContent>
    </Card>
  )
}
