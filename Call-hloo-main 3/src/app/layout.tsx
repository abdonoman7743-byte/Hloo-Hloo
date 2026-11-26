import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cairo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
};

export const metadata: Metadata = {
  title: "اتصل مع عبود | Call with Oboud — WebRTC P2P Studio",
  description:
    "منصة اتصالات مرئية وصوتية ومحادثات فورية نظير-لنظير (WebRTC P2P) مع مصادقة JWT وإشارات فورية وقاعدة بيانات PostgreSQL.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-[100dvh] text-[#0B2B22] antialiased selection:bg-emerald-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
