"use client"

import { createContext, useContext, useMemo } from "react"

export type PaperlessUi = { available: boolean; linkBase: string | null }

const PaperlessContext = createContext<PaperlessUi>({ available: false, linkBase: null })

/** `available`: the feature is on and this user may use it. `linkBase`: the Paperless address, only while available. */
export function PaperlessProvider({ available, linkBase, children }: PaperlessUi & { children: React.ReactNode }) {
  const value = useMemo(() => ({ available, linkBase }), [available, linkBase])
  return <PaperlessContext.Provider value={value}>{children}</PaperlessContext.Provider>
}

export function usePaperless(): PaperlessUi {
  return useContext(PaperlessContext)
}
