import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { DM_Serif_Display, JetBrains_Mono, Noto_Sans_SC, Noto_Serif_SC, Sora } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-dm-serif",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: false,
});

const notoSerifSC = Noto_Serif_SC({
  weight: ["400", "600", "700"],
  variable: "--font-noto-serif-sc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Dynamic Asset Allocation",
  description: "DAA 资产配置与交易记录系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const GA_ID = "G-PD2JWJHVEM"; // Replace with your Google Analytics ID.

  return (
    <html
      lang="zh-CN"
      className={`dark ${dmSerifDisplay.variable} ${sora.variable} ${jetbrainsMono.variable} ${notoSansSC.variable} ${notoSerifSC.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="dark" />

        {/* Google Analytics */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </head>
      <body>
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
