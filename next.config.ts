import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let phones on the same local network load the dev server
  // (e.g. http://192.168.1.20:3000) so the mobile UI can be tested on a real device.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.16.*.*", "*.local"],
  // The dev-mode "N" badge sits on top of the bottom tab bar; errors still show their overlay.
  devIndicators: false,
  // Trace files from this project folder, not a parent that happens to hold another lockfile.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
