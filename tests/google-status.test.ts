import { afterEach, describe, expect, it, vi } from "vitest";
import { createFallbackMapsAdapter, describeGoogleError, probeGooglePlaces, type MapsAdapter } from "@/lib/maps/adapter";
import { probeGoogleRoutes } from "@/lib/routing/travel-time";
import { AppError } from "@/lib/services/errors";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const stub = (res: Response | Error) => (async () => { if (res instanceof Error) throw res; return res; }) as unknown as typeof fetch;

const place = { name: "Built-in place", address: "LA", latitude: 34, longitude: -118, googlePlaceId: null };
const catalog: MapsAdapter = { async search() { return [place]; } };

describe("place search fallback", () => {
  it("uses Google when it works", async () => {
    const google: MapsAdapter = { async search() { return [{ ...place, name: "From Google", googlePlaceId: "g1" }]; } };
    expect((await createFallbackMapsAdapter(google, catalog).search("x"))[0].name).toBe("From Google");
  });

  it("falls back to the built-in places when Google is unavailable, instead of failing the search", async () => {
    const google: MapsAdapter = { async search() { throw new AppError("PROVIDER_UNAVAILABLE", "Place search is unavailable."); } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await createFallbackMapsAdapter(google, catalog).search("x"))[0].name).toBe("Built-in place");
  });

  it("does not hide other kinds of errors", async () => {
    const google: MapsAdapter = { async search() { throw new AppError("VALIDATION_ERROR", "bad input"); } };
    await expect(createFallbackMapsAdapter(google, catalog).search("x")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("Google status checks", () => {
  it("reports a working Places key", async () => {
    expect(await probeGooglePlaces("k", stub(json({ places: [{ id: "p" }] })))).toEqual({ ok: true, httpStatus: 200, detail: "OK (1 result)" });
  });

  it("reports Google's own reason when the key is refused", async () => {
    const denied = json({ error: { status: "PERMISSION_DENIED", message: "Places API (New) has not been used in project 123 before or it is disabled." } }, 403);
    const r = await probeGooglePlaces("k", stub(denied));
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(403);
    expect(r.detail).toContain("PERMISSION_DENIED");
    expect(r.detail).toContain("disabled");
  });

  it("reports a Routes failure the same way, including array-shaped errors", async () => {
    const r = await probeGoogleRoutes("k", stub(json([{ error: { status: "REQUEST_DENIED", message: "API key not valid." } }], 400)));
    expect(r).toMatchObject({ ok: false, httpStatus: 400 });
    expect(r.detail).toContain("REQUEST_DENIED");
  });

  it("says so when Google cannot be reached at all", async () => {
    expect(await probeGooglePlaces("k", stub(new Error("offline")))).toEqual({ ok: false, httpStatus: null, detail: "Could not reach Google from this server." });
    expect((await probeGoogleRoutes("k", stub(new Error("offline")))).ok).toBe(false);
  });

  it("falls back to the HTTP status when the error body is not readable", async () => {
    expect(await describeGoogleError(new Response("<html>", { status: 502 }))).toBe("HTTP 502");
  });

  it("sends the key to Google but never puts it in the reported detail", async () => {
    let header: string | null = null;
    const fetchImpl = (async (_u: string, init: RequestInit) => { header = new Headers(init.headers).get("X-Goog-Api-Key"); return json({ error: { status: "PERMISSION_DENIED", message: "denied" } }, 403); }) as unknown as typeof fetch;
    const r = await probeGooglePlaces("SECRET-KEY-VALUE", fetchImpl);
    expect(header).toBe("SECRET-KEY-VALUE");
    expect(JSON.stringify(r)).not.toContain("SECRET-KEY-VALUE");
  });
});

describe("GET /api/health", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function health(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request("http://localhost/api/health"));
    return { res, text: await res.text() };
  }

  it("shows what is configured without needing a sign-in", async () => {
    const { res, text } = await health({ GOOGLE_MAPS_API_KEY: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    expect(res.status).toBe(200);
    expect(JSON.parse(text).data).toMatchObject({ mode: "mock", googleKeyConfigured: false, sharedDataConfigured: false });
  });

  it("says a key is present but never shows it", async () => {
    const { text } = await health({ GOOGLE_MAPS_API_KEY: "AIza-test-key-should-not-leak", KV_REST_API_URL: "https://kv.test", KV_REST_API_TOKEN: "kv-token-should-not-leak" });
    const data = JSON.parse(text).data;
    expect(data.googleKeyConfigured).toBe(true);
    expect(data.sharedDataConfigured).toBe(true);
    expect(text).not.toContain("should-not-leak");
  });
});
