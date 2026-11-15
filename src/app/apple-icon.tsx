import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#990000" }}>
        <div style={{ width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "#FFCC00", borderRadius: 10, color: "#990000", fontSize: 96, fontWeight: 900 }}>
          T
        </div>
      </div>
    ),
    size,
  );
}
