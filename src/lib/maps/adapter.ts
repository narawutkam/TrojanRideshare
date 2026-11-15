import { AppError } from "@/lib/services/errors";
import type { Location } from "@/types";

/** A place returned by a provider before it is persisted as a Location. */
export interface PlaceCandidate {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  googlePlaceId: string | null;
  /** Set when the candidate already is a persisted location (mock catalog). */
  locationId?: string;
}

/** Provider boundary for place search (README §2: Google Maps sits behind the location service). */
export interface MapsAdapter {
  search(q: string): Promise<PlaceCandidate[]>;
}

/** Mock adapter: searches the seeded catalog; runs without credentials (README §7 "Fallback"). */
export function createMockMapsAdapter(getCatalog: () => Location[]): MapsAdapter {
  return {
    async search(q) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = getCatalog()
        .map((l) => {
          const hay = `${l.name} ${l.address}`.toLowerCase();
          if (!terms.every((t) => hay.includes(t))) return null;
          const score = l.name.toLowerCase().startsWith(terms[0]) ? 0 : l.name.toLowerCase().includes(terms[0]) ? 1 : 2;
          return { l, score };
        })
        .filter((x): x is { l: Location; score: number } => x !== null)
        .sort((a, b) => a.score - b.score || a.l.name.localeCompare(b.l.name));
      return scored.map(({ l }) => ({ name: l.name, address: l.address, latitude: l.latitude, longitude: l.longitude, googlePlaceId: l.googlePlaceId, locationId: l.id }));
    },
  };
}

/**
 * Live adapter: Google Places API (New) Text Search, restricted to the LA area.
 * The key is server-only (README §7) and never sent to the browser.
 */
export function createGoogleMapsAdapter(apiKey: string): MapsAdapter {
  return {
    async search(q) {
      let res: Response;
      try {
        res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
          },
          body: JSON.stringify({
            textQuery: q,
            pageSize: 10,
            locationRestriction: { rectangle: { low: { latitude: 33.65, longitude: -118.95 }, high: { latitude: 34.35, longitude: -117.65 } } },
          }),
          cache: "no-store",
        });
      } catch {
        throw new AppError("PROVIDER_UNAVAILABLE", "Place search is unavailable. Try again.");
      }
      if (!res.ok) throw new AppError("PROVIDER_UNAVAILABLE", "Place search is unavailable. Try again.");
      const body = (await res.json()) as { places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[] };
      return (body.places ?? [])
        .filter((p) => p.location)
        .map((p) => ({
          name: p.displayName?.text ?? p.formattedAddress ?? "Unnamed place",
          address: p.formattedAddress ?? "",
          latitude: p.location!.latitude,
          longitude: p.location!.longitude,
          googlePlaceId: p.id,
        }));
    },
  };
}

/**
 * Use `primary` for place search; if it is unavailable (no quota, key problem, outage), fall back to `fallback`
 * so search keeps working instead of showing an error. The reason is logged by type only.
 */
export function createFallbackMapsAdapter(primary: MapsAdapter, fallback: MapsAdapter): MapsAdapter {
  return {
    async search(q) {
      try {
        return await primary.search(q);
      } catch (e) {
        if (e instanceof AppError && e.code === "PROVIDER_UNAVAILABLE") {
          console.error("Google place search unavailable; using the built-in places instead.");
          return fallback.search(q);
        }
        throw e;
      }
    },
  };
}

/** The result of one test call to a Google API, safe to show: it never includes the key. */
export interface GoogleProbe {
  ok: boolean;
  httpStatus: number | null;
  /** "OK", or Google's own error status and message (for example PERMISSION_DENIED: API not enabled). */
  detail: string;
}

/** Read Google's error body, which looks like { error: { status, message } }. */
export async function describeGoogleError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string } } | { error?: { status?: string; message?: string } }[];
    const err = (Array.isArray(body) ? body[0] : body)?.error;
    if (err) return `${err.status ?? res.status}: ${(err.message ?? "").slice(0, 240)}`;
  } catch {
    /* not JSON */
  }
  return `HTTP ${res.status}`;
}

/** One small Places API (New) search, to show whether this key works from this server. */
export async function probeGooglePlaces(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<GoogleProbe> {
  try {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id" },
      body: JSON.stringify({ textQuery: "Griffith Observatory", pageSize: 1 }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, httpStatus: res.status, detail: await describeGoogleError(res) };
    const body = (await res.json()) as { places?: unknown[] };
    return { ok: true, httpStatus: res.status, detail: `OK (${body.places?.length ?? 0} result)` };
  } catch {
    return { ok: false, httpStatus: null, detail: "Could not reach Google from this server." };
  }
}
