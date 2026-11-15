import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Inter, the typeface of the SC ride design. The font file is kept in the project (src/app/fonts, SIL Open Font
// License) instead of being downloaded from Google during the build, which failed intermittently on Vercel.
const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  weight: "100 900", // one variable file covers every weight the app uses
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SC ride",
  description: "Split an Uber anywhere in LA with other USC students.",
  applicationName: "SC ride",
  // Opens full-screen like an app when added to the iPhone home screen.
  appleWebApp: { capable: true, title: "SC ride", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use safe-area insets around the notch and home bar
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
