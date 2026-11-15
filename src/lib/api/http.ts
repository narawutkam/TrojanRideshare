import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { withDemoStore } from "@/lib/services";
import { AppError, HTTP_STATUS } from "@/lib/services/errors";
import type { ApiFailure, ApiSuccess } from "@/types";

/** Route-layer helpers: common envelope (README §5), CSRF check and rate limiting (README §7). */

export function ok<T>(data: T, init?: { status?: number; nextCursor?: string | null }): Response {
  const body: ApiSuccess<T> = { success: true, data };
  if (init && "nextCursor" in init) body.meta = { nextCursor: init.nextCursor ?? null };
  return Response.json(body, { status: init?.status ?? 200 });
}

export function fail(err: unknown): Response {
  let code: ApiFailure["error"]["code"] = "INTERNAL_ERROR";
  let message = "Something went wrong. Try again.";
  if (err instanceof AppError) {
    code = err.code;
    message = err.message;
  } else if (err instanceof ZodError) {
    code = "VALIDATION_ERROR";
    message = err.issues.map((i) => i.message).join("; ");
  } else {
    // Log the type only: never log session, email, chat or agreement details.
    console.error("Unhandled API error:", err instanceof Error ? err.name : typeof err);
  }
  const body: ApiFailure = { success: false, error: { code, message } };
  return Response.json(body, { status: HTTP_STATUS[code] });
}

/**
 * Run a handler and wrap thrown errors in the failure envelope. Handlers run against the shared demo data when
 * it is configured for serverless hosting; pass `readOnly` for GET handlers so they skip the save.
 */
export async function handle(fn: () => Promise<Response> | Response, opts: { readOnly?: boolean } = {}): Promise<Response> {
  try {
    return await withDemoStore(async () => fn(), opts);
  } catch (err) {
    return fail(err);
  }
}

export async function readJson<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be JSON.");
  }
  return schema.parse(raw);
}

export function readQuery<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  return schema.parse(params);
}

/** Reject cross-site cookie-authenticated writes: the Origin must match the request host. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (tests, curl) send no Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host === host) return;
  } catch {
    /* fall through */
  }
  throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

// ---------- rate limiting (per process; replace with a shared store in live) ----------
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (++b.count > limit) throw new AppError("RATE_LIMITED", "Too many requests. Wait a moment and try again.");
}
