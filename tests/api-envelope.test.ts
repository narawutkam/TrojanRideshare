import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fail, ok } from "@/lib/api/http";
import { AppError } from "@/lib/services/errors";
import { createTripSchema, sendMessageSchema } from "@/lib/validation/schemas";

describe("API envelope (README §5)", () => {
  it("wraps success and collection meta", async () => {
    const res = ok([1, 2], { nextCursor: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [1, 2], meta: { nextCursor: null } });
  });

  it("maps service and validation errors to codes and statuses", async () => {
    const full = fail(new AppError("TRIP_FULL", "This trip is full."));
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ success: false, error: { code: "TRIP_FULL", message: "This trip is full." } });
    expect(fail(new AppError("AGREEMENT_REQUIRED", "x")).status).toBe(422);
    const bad = fail(z.object({ a: z.string() }).safeParse({}).error);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");
    const boom = fail(new Error("secret detail"));
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toContain("secret");
  });

  it("validates UTC timestamps and chat length", () => {
    const base = { pickupLocationId: "00000000-0000-4000-8300-000000000001", destinationLocationId: "00000000-0000-4000-8300-000000000010" };
    expect(createTripSchema.safeParse({ ...base, departureTime: "2026-11-14T03:00:00.000Z" }).success).toBe(true);
    expect(createTripSchema.safeParse({ ...base, departureTime: "2026-11-14T03:00:00-08:00" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ content: "  hi " }).data).toEqual({ content: "hi" });
    expect(sendMessageSchema.safeParse({ content: "x".repeat(1001) }).success).toBe(false);
  });
});
