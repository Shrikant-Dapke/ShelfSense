import type { Metadata } from "next";
import { Geist_Mono, Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Premium Industrial typography: Outfit for headings, Inter for body copy,
// Geist Mono for codes, quantities and currency.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShelfSense — Inventory Expiry & Waste Reduction",
  description:
    "Smarter Inventory. Less Waste. Better Distribution. Inventory expiry and waste reduction platform for food distributors.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-frame text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
