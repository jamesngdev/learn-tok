import "./globals.css";
import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "DailyTok",
  description: "Read the day's news in English, one card at a time.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#0f1319",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
