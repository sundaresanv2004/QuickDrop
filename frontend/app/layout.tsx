import type { Metadata, Viewport } from "next"
import { Geist_Mono, Nunito_Sans } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";
import { WebRTCProvider } from "@/context/WebRTCContext";

const nunitoSans = Nunito_Sans({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "QuickDrop",
  description: "Local P2P file sharing and chat — no cloud, no storage",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QuickDrop",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,       // prevents iOS zoom-on-focus bug
  userScalable: false,
  themeColor: "#000000",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", nunitoSans.variable)}
    >
      <body>
        <WebRTCProvider>
          <ThemeProvider>
            {children}
            <Toaster position="top-right" richColors />
          </ThemeProvider>
        </WebRTCProvider>
      </body>
    </html>
  )
}
