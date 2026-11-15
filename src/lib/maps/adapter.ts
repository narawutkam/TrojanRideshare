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
