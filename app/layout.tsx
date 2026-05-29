import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import { Toaster } from "@/components/ui/sonner";
import { DAA_BRAND_DESCRIPTION, DAA_BRAND_NAME } from "@/src/daa/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: DAA_BRAND_NAME,
  description: DAA_BRAND_DESCRIPTION,
  icons: {
    icon: [
      { url: "/daa/brand/dynamic-rebalance-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/daa/brand/dynamic-rebalance-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/daa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
      suppressHydrationWarning
    >
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="color-scheme" content="light" />

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
        <Toaster theme="light" />
      </body>
    </html>
  );
}
