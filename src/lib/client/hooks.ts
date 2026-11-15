"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import type { Region, User } from "@/types";

/** Load async data with loading/error/retry state. Redirects to /login on 401. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e instanceof ApiError ? e : new ApiError("INTERNAL_ERROR", "Something went wrong.", 500);
        if (err.code === "UNAUTHORIZED") router.replace("/login");
        setError(err);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

let regionCache: Promise<Region[]> | null = null;
export function useRegions(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    regionCache ??= api.regions().catch((e) => { regionCache = null; throw e; });
    regionCache.then((rs) => setMap(new Map(rs.map((r) => [r.id, r.name])))).catch(() => {});
  }, []);
  return map;
}

export function useCurrentUser() {
  return useLoad<User>(() => api.me(), []);
}
