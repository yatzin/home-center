"use client"

import { createContext, useContext } from "react"

const ViewerContext = createContext({ isAdmin: false })

/** Who is looking, for client UI that shows an admin-only shortcut. The server still enforces every admin action. */
export function ViewerProvider({ isAdmin, children }: { isAdmin: boolean; children: React.ReactNode }) {
  return <ViewerContext.Provider value={{ isAdmin }}>{children}</ViewerContext.Provider>
}

export function useIsAdmin(): boolean {
  return useContext(ViewerContext).isAdmin
}
