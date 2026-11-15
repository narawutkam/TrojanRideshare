import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/maps/polyline";
import { fitProjection, googleDirectionsUrl } from "@/lib/maps/project";

describe("polyline", () => {
  it("decodes the example from Google's documentation", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });

  it("round-trips a route through LA", () => {
    const path: [number, number][] = [[34.0224, -118.2851], [34.0617, -118.3089], [34.0983, -118.3243]];
    expect(decodePolyline(encodePolyline(path))).toEqual(path);
  });

  it("handles an empty path and rejects a truncated one", () => {
    expect(decodePolyline("")).toEqual([]);
    expect(() => decodePolyline("_p~iF~ps|U_ulLnnq")).toThrow(/Truncated/);
  });
});

describe("diagram projection", () => {
  const places = [{ latitude: 34.02, longitude: -118.28 }, { latitude: 34.1, longitude: -118.32 }];

  it("puts north up and east to the right, inside the box", () => {
    const p = fitProjection(places, 340, 220);
    const [x1, y1] = p.at(places[0].latitude, places[0].longitude); // south-east
    const [x2, y2] = p.at(places[1].latitude, places[1].longitude); // north-west
    expect(y2).toBeLessThan(y1);
    expect(x2).toBeLessThan(x1);
    for (const v of [x1, x2]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(340); }
    for (const v of [y1, y2]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(220); }
  });

  it("does not blow up for one point or a very short hop", () => {
    const one = fitProjection([places[0]], 340, 220);
    const [x, y] = one.at(places[0].latitude, places[0].longitude);
    expect(x).toBeCloseTo(170, 5);
    expect(y).toBeCloseTo(110, 5);
    const hop = fitProjection([places[0], { latitude: 34.0201, longitude: -118.2801 }], 340, 220);
    const [hx, hy] = hop.at(34.0201, -118.2801);
    expect(Number.isFinite(hx) && Number.isFinite(hy)).toBe(true);
  });
});

describe("Google Maps directions link", () => {
  it("lists the stops in order and needs no key", () => {
    const url = new URL(googleDirectionsUrl([
      { latitude: 34.0224, longitude: -118.2851 }, { latitude: 34.0617, longitude: -118.3089 }, { latitude: 34.0983, longitude: -118.3243 },
    ]));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("34.0224,-118.2851");
    expect(url.searchParams.get("destination")).toBe("34.0983,-118.3243");
    expect(url.searchParams.get("waypoints")).toBe("34.0617,-118.3089");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.has("key")).toBe(false);
  });

  it("leaves out waypoints for a direct trip", () => {
    const url = new URL(googleDirectionsUrl([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }]));
    expect(url.searchParams.has("waypoints")).toBe(false);
  });
});

describe("Google Maps link for a single place", () => {
  it("opens a search on that place, for the pickup map", () => {
    const url = new URL(googleDirectionsUrl([{ latitude: 34.0256, longitude: -118.2853 }]));
    expect(url.pathname).toBe("/maps/search/");
    expect(url.searchParams.get("query")).toBe("34.0256,-118.2853");
  });
});
