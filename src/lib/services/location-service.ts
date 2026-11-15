import { newId } from "@/lib/ids";
import { PICKUP_IDS } from "@/lib/mock/fixtures";
import { REGIONS, regionIdFor } from "@/lib/regions/regions";
import { page, type ServiceContext } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import { PAGE_SIZE, type Location, type Region } from "@/types";

/** LocationService (README §5): place search, regions and internal region lookup. */
export class LocationService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Search places and return persisted, validated locations with their region. */
  async searchLocations(q: string, cursor?: string): Promise<{ items: Location[]; nextCursor: string | null }> {
    const candidates = await this.ctx.maps.search(q);
    const persisted = candidates.map((c) => {
      if (c.locationId) {
        const existing = this.getLocation(c.locationId);
        if (existing) return existing;
      }
      if (c.googlePlaceId) {
        const existing = this.ctx.db.locations.find((l) => l.googlePlaceId === c.googlePlaceId);
        if (existing) return existing;
      }
      if (!(Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180)) return null; // validate coordinate ranges
      const loc: Location = {
        id: newId(), name: c.name, address: c.address, latitude: c.latitude, longitude: c.longitude,
        regionId: regionIdFor(c.latitude, c.longitude), googlePlaceId: c.googlePlaceId,
      };
      this.ctx.db.locations.push(loc);
      return loc;
    }).filter((l): l is Location => l !== null);
    return page(persisted, cursor, `search:${q.toLowerCase()}`, PAGE_SIZE);
  }

  getRegions(cursor?: string): { items: Region[]; nextCursor: string | null } {
    return page(REGIONS.map(({ id, name }) => ({ id, name })), cursor, "regions", PAGE_SIZE);
  }

  /** Campus pickup catalog used by the initial UI (README §5). */
  getPickups(): Location[] {
    return PICKUP_IDS.map((id) => this.getLocation(id)).filter((l): l is Location => !!l);
  }

  getLocation(id: string): Location | null {
    return this.ctx.db.locations.find((l) => l.id === id) ?? null;
  }

  requireLocation(id: string, field: string): Location {
    const loc = this.getLocation(id);
    if (!loc) throw new AppError("VALIDATION_ERROR", `Unknown ${field}.`);
    return loc;
  }

  /** Internal region lookup. */
  regionOf(location: Location): string | null {
    return location.regionId;
  }

  isPickup(id: string): boolean {
    return (PICKUP_IDS as readonly string[]).includes(id);
  }
}
