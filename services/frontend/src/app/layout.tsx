import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppChrome from "../components/AppChrome";
import Analytics from "../components/Analytics";
import { SidebarProvider } from "../contexts/SidebarContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthProvider } from "../lib/firebase/auth-context";
import { TENANT, branding } from "../config/tenant";

// Per-tenant theme, injected from the active tenant's manifest branding.
// `html[data-tenant]` out-specifies the :root/.dark/.light defaults in
// globals.css, so this wins regardless of source order. Build-time static (one
// tenant per build), so there's no flash and no runtime cost.
//   - accent: the brand accent ramp (always present).
//   - palette: OPTIONAL overrides for ANY other token (surfaces, the ambient
//     --c-orb-* ultrablur hues, status colours, …). A tenant with no palette
//     (e.g. Noise) inherits every globals.css default → byte-identical.
const a = branding.accent;
const palette = (branding as { palette?: Record<string, string> }).palette ?? {};
const overrides: Record<string, string> = {
  ...palette,
  "--font-sans": branding.font.sans,
  "--font-display": branding.font.display,
};
const overrideCss = Object.entries(overrides)
  .map(([token, value]) => `${token}:${value};`)
  .join("");
const accentStyle = `
html[data-tenant="${TENANT}"]{--c-accent-100:${a["100"]};--c-accent-300:${a["300"]};--c-accent-400:${a["400"]};--c-accent-500:${a["500"]};--c-accent-600:${a["600"]};--c-accent-900:${a["900"]};--c-accent-950:${a["950"]};--c-accent:${a.onDark};${overrideCss}}
html[data-tenant="${TENANT}"].light{--c-accent:${a.onLight};}`;

// Runs before first paint: resolves the saved preference (or the OS setting on
// a fresh visit) and sets the `light`/`dark` class on <html> so there's never a
// flash of the wrong theme. Kept as a tiny string so it can be inlined in
// <head>; ThemeProvider takes over syncing once React hydrates.
// `def` is the tenant's default theme: "dark"/"light" force it; "system" follows
// the OS (Noise's historical behaviour). A saved preference always wins.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var def='${branding.defaultTheme}';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var m=(t==='light'||t==='dark')?t:(def==='system'?sys:def);var r=document.documentElement;r.classList.add(m);r.style.colorScheme=m;}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: branding.brandName,
  description: `${branding.brandName} Agentic OS Platform`,
  // Per-tenant favicon (no cross-tenant leak — each tenant supplies its own).
  icons: { icon: branding.favicon },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-tenant={TENANT} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style dangerouslySetInnerHTML={{ __html: accentStyle }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-canvas text-foreground`}
      >
        <Analytics />
        <ThemeProvider>
          <AuthProvider>
            <SidebarProvider>
              <AppChrome>{children}</AppChrome>
            </SidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
