"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldHelp } from "@/components/ui/field-help"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CATEGORY_ICONS, CategoryIcon } from "@/components/category-icon"
import { deleteCategory, reorderCategories, resetCategory, saveCategory } from "@/lib/actions/categories"
import { serviceColor, type CategoryAudience, type CategoryDef, type CategoryScope } from "@/lib/categories"

const AUDIENCE_LABEL: Record<CategoryAudience, string> = { ALL: "Everything", ASSET: "Houses, vehicles, equipment", PERSON: "People" }

type Draft = { key?: string; label: string; icon: string; color: string; audience: CategoryAudience; hidden: boolean; builtIn: boolean }

/** A colour input needs a #rrggbb value; the default may be a CSS variable, so show a neutral one. */
const pickerValue = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#6b7280")

/** Only a chosen hex is saved as a colour; a built-in's CSS-variable default stays null (automatic). */
const hexOrNull = (c: string | null) => (c && c.startsWith("#") ? c : null)

function Section({ scope, title, description, help, defs }: { scope: CategoryScope; title: string; description: string; help: string; defs: CategoryDef[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)
  const rows = defs.filter((d) => d.scope === scope)

  function run(action: () => Promise<{ error: string } | { success: true }>, done?: string) {
    start(async () => {
      const r = await action()
      if ("error" in r) {
        toast.error(r.error)
        return
      }
      if (done) toast.success(done)
      setDraft(null)
      router.refresh()
    })
  }

  function move(i: number, by: -1 | 1) {
    const keys = rows.map((r) => r.key)
    const other = keys[i + by]
    keys[i + by] = keys[i]
    keys[i] = other
    run(() => reorderCategories(scope, keys))
  }

  function save() {
    if (!draft) return
    run(
      () => saveCategory({ scope, key: draft.key, label: draft.label, icon: draft.icon || null, color: draft.color || null, audience: draft.audience, hidden: draft.hidden }),
      "Saved."
    )
  }

  return (
    <Card className="py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-1.5">{title}<FieldHelp id={help} /></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        <ul className="divide-y rounded-md border">
          {rows.map((d, i) => (
            <li key={d.key} className="flex items-center gap-2 px-3 py-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ background: scope === "SERVICE" ? serviceColor(d.key, defs) : (d.color ?? "var(--muted-foreground)") }}
              />
              <CategoryIcon name={d.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className={d.hidden ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{d.label}</span>
                {scope === "SERVICE" && d.audience !== "ALL" && <span className="ml-2 text-xs text-muted-foreground">{AUDIENCE_LABEL[d.audience]}</span>}
                {d.hidden && <span className="ml-2 text-xs text-muted-foreground">Hidden</span>}
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Move ${d.label} up`} disabled={pending || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Move ${d.label} down`} disabled={pending || i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button
                type="button" variant="ghost" size="icon" disabled={pending}
                aria-label={d.hidden ? `Show ${d.label}` : `Hide ${d.label}`}
                onClick={() => run(() => saveCategory({ scope, key: d.key, label: d.label, icon: d.icon, color: hexOrNull(d.color), audience: d.audience, hidden: !d.hidden }))}
              >
                {d.hidden ? <EyeOff /> : <Eye />}
              </Button>
              <Button
                type="button" variant="ghost" size="icon" aria-label={`Edit ${d.label}`} disabled={pending}
                onClick={() => setDraft({ key: d.key, label: d.label, icon: d.icon ?? "", color: hexOrNull(d.color) ?? "", audience: d.audience, hidden: d.hidden, builtIn: d.builtIn })}
              >
                <Pencil />
              </Button>
            </li>
          ))}
        </ul>

        {draft ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <div className="text-sm font-medium">{draft.key ? "Edit category" : "New category"}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`${scope}-name`} help="categories.name">Name</Label>
                <Input id={`${scope}-name`} value={draft.label} maxLength={40} onChange={(e) => setDraft({ ...draft, label: e.target.value })} autoFocus />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${scope}-icon`} help="categories.icon">Icon</Label>
                <select
                  id={`${scope}-icon`}
                  className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  value={draft.icon}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                >
                  <option value="">None</option>
                  {Object.keys(CATEGORY_ICONS).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              {scope === "SERVICE" && (
                <div className="space-y-1">
                  <Label htmlFor="SERVICE-audience" help="categories.audience">Offered for</Label>
                  <select
                    id="SERVICE-audience"
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-60"
                    value={draft.audience}
                    disabled={draft.builtIn}
                    onChange={(e) => setDraft({ ...draft, audience: e.target.value as CategoryAudience })}
                  >
                    {(Object.keys(AUDIENCE_LABEL) as CategoryAudience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor={`${scope}-color`} help="categories.color">Colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`${scope}-color`} type="color" className="h-8 w-12 cursor-pointer rounded border border-input bg-background p-0.5"
                    value={pickerValue(draft.color)} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, color: "" })} disabled={!draft.color}>Automatic</Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={pending || !draft.label.trim()} onClick={save}>Save</Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setDraft(null)}>Cancel</Button>
              <span className="flex-1" />
              {draft.key && draft.builtIn && (
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => resetCategory(scope, draft.key!), "Reset to default.")}>
                  <RotateCcw /> Reset to default
                </Button>
              )}
              {draft.key && !draft.builtIn && (
                <Button
                  type="button" variant="destructive" size="sm" disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete "${draft.label}"?`)) run(() => deleteCategory(scope, draft.key!), "Deleted.")
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setDraft({ label: "", icon: "", color: "", audience: scope === "SERVICE" ? "ASSET" : "ALL", hidden: false, builtIn: false })}
          >
            <Plus /> Add category
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function CategorySettings({ defs }: { defs: CategoryDef[] }) {
  return (
    <div className="max-w-2xl space-y-6">
      <Section scope="SERVICE" title="Spending categories" help="categories.spending" description="What a service record's money was spent on. Used by Costs, reports and the forms for logging services and visits." defs={defs} />
      <Section scope="EQUIPMENT" title="Equipment categories" help="categories.equipment" description="How equipment items are grouped." defs={defs} />
      <p className="text-sm text-muted-foreground">
        Renaming changes the label everywhere and leaves records untouched. A hidden category disappears from the forms but stays on the records that already use it.
      </p>
    </div>
  )
}
