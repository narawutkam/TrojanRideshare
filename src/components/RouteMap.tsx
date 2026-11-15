"use client";

import { useEffect, useRef, useState } from "react";
import { decodePolyline } from "@/lib/maps/polyline";
import { fitProjection, googleDirectionsUrl } from "@/lib/maps/project";
import { REGIONS } from "@/lib/regions/regions";
import type { MapStop, TripMap } from "@/types";

/**
 * The route the Uber is expected to take, drawn on a map. With a browser Google Maps key
 * (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) it is a real map with the road path; without one, or if the key is
 * refused, it is a simple diagram of LA with the stops joined by straight lines. Either way there is a link that
 * opens the same route in Google Maps, which needs no key.
 */

const INK = "#1c1c1c";
const CARDINAL = "#990000";
const GOLD = "#ffcc00";

function marker(s: MapStop): { fill: string; stroke: string; text: string; label: string } {
  if (s.yours) return { fill: GOLD, stroke: CARDINAL, text: INK, label: String(s.order) };
  if (s.kind === "pickup") return { fill: "#ffffff", stroke: INK, text: INK, label: "P" };
  if (s.kind === "final") return { fill: CARDINAL, stroke: CARDINAL, text: "#ffffff", label: String(s.order) };
  return { fill: INK, stroke: INK, text: "#ffffff", label: String(s.order) };
}

// ---------- Google map (only with a browser key) ----------

interface GMapsApi {
  maps: {
    Map: new (el: HTMLElement, opts: object) => { fitBounds(b: unknown, padding?: number): void };
    Polyline: new (opts: object) => { setMap(m: unknown): void };
    Marker: new (opts: object) => { setMap(m: unknown): void };
    LatLngBounds: new () => { extend(p: { lat: number; lng: number }): void };
    SymbolPath: { CIRCLE: number };
  };
}
type GoogleWindow = { google?: GMapsApi; gm_authFailure?: () => void; __initSCRideMap?: () => void };

let mapsLoading: Promise<GMapsApi> | null = null;

function loadGoogleMaps(key: string): Promise<GMapsApi> {
  const w = window as unknown as GoogleWindow;
  if (w.google?.maps) return Promise.resolve(w.google);
  mapsLoading ??= new Promise<GMapsApi>((resolve, reject) => {
    w.__initSCRideMap = () => (w.google ? resolve(w.google) : reject(new Error("Maps did not load.")));
    w.gm_authFailure = () => reject(new Error("The Maps key was refused."));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__initSCRideMap`;
    s.async = true;
    s.onerror = () => reject(new Error("Maps could not be loaded."));
    document.head.appendChild(s);
  }).catch((e) => { mapsLoading = null; throw e; });
  return mapsLoading;
}

function GoogleRouteMap({ map, apiKey, onFail }: { map: TripMap; apiKey: string; onFail: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const drawn: { setMap(m: unknown): void }[] = [];
    loadGoogleMaps(apiKey).then((g) => {
      if (cancelled || !ref.current) return;
      const m = new g.maps.Map(ref.current, { disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false });
      const bounds = new g.maps.LatLngBounds();
      const path = map.encodedPolyline
        ? decodePolyline(map.encodedPolyline).map(([lat, lng]) => ({ lat, lng }))
        : map.stops.map((s) => ({ lat: s.latitude, lng: s.longitude }));
      path.forEach((p) => bounds.extend(p));
      drawn.push(new g.maps.Polyline({ path, strokeColor: CARDINAL, strokeOpacity: 0.9, strokeWeight: 5, map: m }));
      for (const s of map.stops) {
        const c = marker(s);
        const position = { lat: s.latitude, lng: s.longitude };
        bounds.extend(position);
        drawn.push(new g.maps.Marker({
          position, map: m, title: s.name,
          label: { text: c.label, color: c.text, fontWeight: "700", fontSize: "12px" },
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 12, fillColor: c.fill, fillOpacity: 1, strokeColor: c.stroke, strokeWeight: 2 },
        }));
      }
      m.fitBounds(bounds, 36);
    }).catch(() => { if (!cancelled) onFail(); });
    return () => { cancelled = true; drawn.forEach((d) => d.setMap(null)); };
  }, [map, apiKey, onFail]);

  return <div ref={ref} className="h-[240px] w-full" role="img" aria-label="Map of the route" />;
}

// ---------- diagram (no key needed) ----------

function RouteDiagram({ map }: { map: TripMap }) {
  const W = 340, H = 240;
  // Frame the route, with the surrounding regions as context.
  const proj = fitProjection(map.stops, W, H, 0.2);
  const regionPath = (polygon: [number, number][]) => polygon.map(([lng, lat], i) => `${i ? "L" : "M"}${proj.at(lat, lng).map((n) => n.toFixed(1)).join(" ")}`).join(" ") + "Z";
  const pts = map.stops.map((s) => proj.at(s.latitude, s.longitude));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Diagram of the route">
      <rect width={W} height={H} fill="#f5f5f4" />
      {REGIONS.map((r) => <path key={r.id} d={regionPath(r.polygon)} fill="#ebebe8" stroke="#ffffff" strokeWidth="2" />)}
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={CARDINAL} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
      {map.stops.map((s, i) => {
        const c = marker(s);
        const [x, y] = pts[i];
        return (
          <g key={s.order}>
            {s.kind === "final" && !s.yours
              ? <rect x={x - 11} y={y - 11} width="22" height="22" rx="4" fill={c.fill} stroke={c.stroke} strokeWidth="2" />
              : <circle cx={x} cy={y} r="11" fill={c.fill} stroke={c.stroke} strokeWidth="2" />}
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={c.text} style={{ fontFamily: "inherit" }}>{c.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- the card ----------

export function RouteMap({ map, className = "", label = "Your route", caption = "Estimated route. Uber may choose a different road.", linkLabel = "Open in Maps" }: {
  map: TripMap; className?: string; label?: string; caption?: string; linkLabel?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  const [failed, setFailed] = useState(false);
  const google = !!apiKey && !failed;
  const directions = googleDirectionsUrl(map.stops);

  return (
    <figure className={`overflow-hidden rounded-xl border border-line bg-white ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cardinal">{label}</p>
        <p className="text-[11px] uppercase tracking-[0.04em] text-muted">{google ? "Estimated" : "Diagram · not to scale"}</p>
      </div>
      <div className="mt-2">
        {google ? <GoogleRouteMap map={map} apiKey={apiKey} onFail={() => setFailed(true)} /> : <RouteDiagram map={map} />}
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-4 py-3 text-[12px] leading-snug text-muted">
        <span>{caption}</span>
        <a href={directions} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center font-semibold text-cardinal hover:underline">{linkLabel}</a>
      </figcaption>
    </figure>
  );
}
