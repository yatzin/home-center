"use client"

import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

// Model output is untrusted text: react-markdown renders no raw HTML and drops
// javascript: URLs by default, and images are dropped (see below). Internal links go through next/link so following
// one keeps the chat panel open.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_td]:border-b [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // No images: untrusted output must not make the browser fetch remote URLs.
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) =>
            // /api/files/… are downloads, not pages: plain link in a new tab.
            href && href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
