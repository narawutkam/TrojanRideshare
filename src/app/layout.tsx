import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trojan Rideshare",
  description: "Split an Uber anywhere in LA with other USC students.",
  applicationName: "Trojan Rideshare",
  // Opens full-screen like an app when added to the iPhone home screen.
  appleWebApp: { capable: true, title: "Rideshare", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use safe-area insets around the notch and home bar
  themeColor: "#990000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
