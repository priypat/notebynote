import type { Metadata, Viewport } from "next";
import { Fraunces, Figtree } from "next/font/google";
import { BROWSER_CHROME } from "@/lib/tokens";
import "./globals.css";

// Display — high-contrast serif. Variable, so the SOFT / WONK / opsz axes stay
// available to CSS (see .display and .numeral in globals.css).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

// Body — boring-good. Tall x-height, open apertures, holds up at 18px.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lung Tunes",
  description:
    "Sing along to real songs and watch your breath draw a landscape.",
  applicationName: "Lung Tunes",
  appleWebApp: { capable: true, title: "Lung Tunes", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available. Never lock it — some people need it to read.
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BROWSER_CHROME.dawn },
    { media: "(prefers-color-scheme: dark)", color: BROWSER_CHROME.dusk },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${figtree.variable} antialiased`}>
        {/* Portrait-first shell: phone-width column, centred on anything wider.
            Safe-area padding for notches and home indicators. */}
        <div className="mx-auto min-h-dvh w-full max-w-[480px] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
          {children}
        </div>
      </body>
    </html>
  );
}
