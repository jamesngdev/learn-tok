import "./globals.css";
import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "DailyTok",
  description: "Read the day's news in English, one card at a time.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "DailyTok",
    statusBarStyle: "black-translucent",
  },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f1319" },
    { media: "(prefers-color-scheme: light)", color: "#fbf8f1" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Let the app background extend under the iOS status bar / notch so it
  // reads as one surface (paired with safe-area padding in CSS).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
