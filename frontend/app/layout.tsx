// app/layout.tsx

import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { Header } from "@/src/components/Header";

export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fundarc.netlify.app";
const previewImage = "/brand/fundarc-banner.png";
const logoImage = "/brand/fundarc-logo.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Fundarc | USDC Milestone Funding on Arc",
    template: "%s | Fundarc",
  },
  description:
    "Fundarc is a USDC-native milestone funding protocol on Arc where creator funds unlock only after contributor review and approval.",
  applicationName: "Fundarc",
  authors: [{ name: "Fundarc" }],
  creator: "Fundarc",
  publisher: "Fundarc",
  keywords: [
    "Fundarc",
    "Arc",
    "USDC",
    "Circle",
    "crowdfunding",
    "milestone funding",
    "stablecoins",
    "AI agents",
  ],
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      { url: logoImage, type: "image/png" },
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: logoImage,
    apple: logoImage,
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Fundarc",
    title: "Fundarc | USDC Milestone Funding on Arc",
    description:
      "Create, fund, review, and approve milestone-based campaigns using USDC on Arc.",
    images: [
      {
        url: previewImage,
        width: 1774,
        height: 887,
        alt: "Fundarc - USDC milestone funding on Arc",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@fundarcapp",
    creator: "@fundarcapp",
    title: "Fundarc | USDC Milestone Funding on Arc",
    description:
      "USDC-native milestone funding where creator funds unlock after contributor approval.",
    images: [previewImage],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const FRONTEND_MAINTENANCE =
  process.env.MAINTENANCE_MODE === "true" ||
  process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (FRONTEND_MAINTENANCE) {
    return (
      <html lang="en">
        <body>
          <main className="maintenance-page">
            <section className="maintenance-shell">
              <span className="badge badge-warn">Maintenance mode</span>
              <h1>Fundarc is temporarily unavailable</h1>
              <p>
                Updates are in progress.
              </p>
            </section>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
