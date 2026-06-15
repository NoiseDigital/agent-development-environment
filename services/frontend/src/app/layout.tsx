import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppChrome from "../components/AppChrome";
import { SidebarProvider } from "../contexts/SidebarContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthProvider } from "../lib/firebase/auth-context";

// Runs before first paint: resolves the saved preference (or the OS setting on
// a fresh visit) and sets the `light`/`dark` class on <html> so there's never a
// flash of the wrong theme. Kept as a tiny string so it can be inlined in
// <head>; ThemeProvider takes over syncing once React hydrates.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var m=(t==='light'||t==='dark')?t:(d?'dark':'light');var r=document.documentElement;r.classList.add(m);r.style.colorScheme=m;}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NoiseOS",
  description: "Noise Digital Agentic OS Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-canvas text-foreground`}
      >
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
