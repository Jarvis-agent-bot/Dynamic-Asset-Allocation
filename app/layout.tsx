import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import { Toaster } from "@/components/ui/sonner";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: DAA_BRAND_NAME,
  description: "DAA 资产配置与交易记录系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const GA_ID = "G-PD2JWJHVEM";
  const analyticsEnabled = process.env.NODE_ENV === "production";

  return (
    <html
      lang="zh-CN"
      className="dark"
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="dark" />

        {analyticsEnabled ? (
          <>
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
          </>
        ) : null}
      </head>
      <body>
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
