import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PlatformSidebar from "../components/PlatformSidebar";
import FloatingAssistant from "../components/FloatingAssistant";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Noise Digital - Agent Platform",
  description: "Noise Digital Agent Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex h-screen bg-black overflow-hidden">
          <PlatformSidebar />
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {children}
          </div>
        </div>
        <FloatingAssistant />
      </body>
    </html>
  );
}
