import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeIcons } from "@/components/theme-icons";
import { themeNames } from "@/lib/themes";
import { fontVariables } from "./fonts";
import "./globals.css";
import "./brand-icon.css";

export const metadata: Metadata = {
  title: "HomeCenter",
  description: "Track and manage your homes and vehicles",
  // iOS ignores most of the manifest: these make Add to Home Screen open
  // full-screen with the right name and icon.
  appleWebApp: { capable: true, title: "HomeCenter", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// viewport-fit=cover lets the installed app use the whole screen on notched phones; the shell
// pads for the safe areas (app/(app)/layout.tsx, components/mobile-tab-bar.tsx). Desktop is unaffected.
export const viewport: Viewport = { themeColor: "#ffffff", viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontVariables} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        {/* Each theme name lands on <html> as both a class (so "dark" is .dark) and
            data-theme (so "ledger" is [data-theme="ledger"]); see lib/themes.ts. */}
        <ThemeProvider attribute={["class", "data-theme"]} themes={themeNames} defaultTheme="light" enableSystem={false}>
          <ThemeIcons />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
