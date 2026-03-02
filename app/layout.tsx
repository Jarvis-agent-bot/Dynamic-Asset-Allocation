import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

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
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="dark light" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function () {
              try {
                var theme = localStorage.getItem("theme");
                if (theme === "light") document.documentElement.classList.remove("dark");
                if (theme === "dark") document.documentElement.classList.add("dark");
              } catch (e) {}
            })();
          `}
        </Script>

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
        <Toaster />
      </body>
    </html>
  );
}
