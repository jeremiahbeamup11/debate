import type { Metadata } from "next";
import { Syne } from "next/font/google";
import { POWERED_BY, PRODUCT_NAME } from "@/config/branding";
import "./globals.css";

// Syne is TruthCore's typeface. Self-hosted by next/font (no external request),
// which keeps the strict CSP intact.
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${POWERED_BY}`,
  description: "Two friends debate. Everyone judges. TruthCore fact-checks live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-bg text-fg">{children}</body>
    </html>
  );
}
