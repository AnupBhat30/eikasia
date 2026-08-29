import type { Metadata, Viewport } from "next";

import "./globals.css";

const SITE_URL = "https://eikasia.anupbhat.com";
const SITE_DESCRIPTION =
  "A private, browser-based cinematic photo editor for film simulations, color grading, grain, overlays, crops, and editorial text.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Eikasia — Cinematic Photo Editor",
    template: "%s · Eikasia",
  },
  applicationName: "Eikasia",
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  category: "photo editing",
  authors: [{ name: "Anup Bhat" }],
  creator: "Anup Bhat",
  publisher: "Anup Bhat",
  keywords: [
    "online photo editor",
    "photo editor",
    "film simulation",
    "film photo editor",
    "image filters",
    "cinematic color grading",
    "Kodak film filters",
    "Instagram photo editor",
  ],
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Eikasia",
    title: "Eikasia — Cinematic Photo Editor",
    description: SITE_DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/eikasia-editor-og.jpg",
        width: 1200,
        height: 630,
        alt: "Eikasia cinematic photo editor interface with a Kodak Gold film look",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eikasia — Cinematic Photo Editor",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/eikasia-editor-og.jpg",
        alt: "Eikasia cinematic photo editor interface with a Kodak Gold film look",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Eikasia",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico?v=2",
        sizes: "16x16 32x32 48x48 64x64 128x128 256x256",
      },
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon-32x32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png?v=2", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  colorScheme: "dark",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Eikasia",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern web browser with JavaScript enabled",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: "Anup Bhat",
    },
  };

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
