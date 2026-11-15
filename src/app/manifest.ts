import type { MetadataRoute } from "next";

/** Web app manifest: "Add to Home Screen" opens the app full-screen (mobile-first, README §1). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trojan Rideshare",
    short_name: "Rideshare",
    description: "Split an Uber anywhere in LA with other USC students.",
    start_url: "/trips",
    display: "standalone",
    orientation: "portrait",
    background_color: "#990000",
    theme_color: "#990000",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
