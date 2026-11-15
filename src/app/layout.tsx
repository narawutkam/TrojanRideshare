import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

// Source Sans is the open version of the typeface USC's own sign-in uses.
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-source" });

export const metadata: Metadata = {
  title: "Trojan Rideshare",
  description: "Split an Uber anywhere in LA with other USC students.",
  applicationName: "Trojan Rideshare",
  // Opens full-screen like an app when added to the iPhone home screen.
  appleWebApp: { capable: true, title: "Rideshare", statusBarStyle: "default" },
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
    <html lang="en" className={sourceSans.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
