import { getConfig } from "@/config/env";
import { handle, ok, rateLimit } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import { probeGooglePlaces } from "@/lib/maps/adapter";
import { probeGoogleRoutes } from "@/lib/routing/travel-time";
import { sharedStoreConfigured } from "@/lib/services";
import type { HealthInfo } from "@/types";

/**
 * GET /api/health: what this deployment is configured with. Shows yes/no only, never a key or a secret.
 * GET /api/health?check=google (signed in): makes one test call to each Google API and reports Google's own
 * answer, which is usually enough to see why the key is not working (API not enabled, billing, restrictions).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const config = getConfig();
    const info: HealthInfo = {
      mode: config.appMode,
      googleKeyConfigured: !!config.googleMapsApiKey,
      sharedDataConfigured: sharedStoreConfigured(),
      environment: process.env.VERCEL_ENV ?? null,
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    };

    if (new URL(req.url).searchParams.get("check") === "google") {
      const actor = await requireActor();
      rateLimit(`health:${actor.id}`, 5);
      if (!config.googleMapsApiKey) {
        info.google = { configured: false, places: null, routes: null };
      } else {
        const [places, routes] = await Promise.all([probeGooglePlaces(config.googleMapsApiKey), probeGoogleRoutes(config.googleMapsApiKey)]);
        info.google = { configured: true, places, routes };
      }
    }
    return ok(info);
  }, { readOnly: true });
}
