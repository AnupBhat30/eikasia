import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Eikasia",
  description:
    "A cinematic image editor for film simulations, grading, overlays, and editorial text.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
