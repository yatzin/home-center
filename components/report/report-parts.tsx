// Shared pieces used by both the generic asset report and the person-specific
// health summary, so the two documents share their section chrome.

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="border-b pb-1.5 text-[9pt] font-semibold uppercase tracking-[0.12em]"
      style={{ borderColor: "var(--rule-strong)", color: "var(--accent)" }}
      data-print-color=""
    >
      {children}
    </h2>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[9.5pt] italic" style={{ color: "var(--ink-faint)" }}>
      {children}
    </p>
  )
}
