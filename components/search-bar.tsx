"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"

interface FilterOption { value: string; label: string }

interface Props {
  placeholder?: string
  filters?: { key: string; placeholder: string; options: FilterOption[] }[]
}

export function SearchBar({ placeholder = "Search…", filters = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete("page")
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const hasFilters = searchParams.size > 0
  const q = searchParams.get("q") ?? ""

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder={placeholder}
          defaultValue={q}
          onChange={(e) => {
            clearTimeout((window as Window & { _searchTimer?: ReturnType<typeof setTimeout> })._searchTimer)
            ;(window as Window & { _searchTimer?: ReturnType<typeof setTimeout> })._searchTimer = setTimeout(() => update("q", e.target.value), 300)
          }}
        />
      </div>
      {filters.map((f) => (
        <Select key={f.key} value={searchParams.get(f.key) ?? ""} onValueChange={(v) => update(f.key, v === "__all__" ? "" : (v ?? ""))}>
          <SelectTrigger className="h-8 text-sm w-44">
            <SelectValue placeholder={f.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{f.placeholder}</SelectItem>
            {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ))}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => router.push(pathname)}>
          <X className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  )
}
