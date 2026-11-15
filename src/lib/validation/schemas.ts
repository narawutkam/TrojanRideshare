import { z } from "zod";
import { CHAT_MAX_LENGTH } from "@/types";

/** Request validators for the routes in README §5. */

export const idSchema = z.string().uuid();

/** ISO 8601 UTC with a trailing Z (README §3). */
export const utcTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/, "Use an ISO 8601 UTC timestamp ending in Z")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid timestamp");

export const listTripsQuerySchema = z.object({
  destinationLocationId: idSchema.optional(),
  regionId: idSchema.optional(),
  from: utcTimeSchema.optional(),
  to: utcTimeSchema.optional(),
  scope: z.enum(["discover", "mine"]).default("discover"),
  cursor: z.string().max(200).optional(),
});

export const createTripSchema = z
  .object({
    pickupLocationId: idSchema,
    destinationLocationId: idSchema,
    departureTime: utcTimeSchema,
    returnDepartureTime: utcTimeSchema.optional(),
  })
  .strict()
  .refine((v) => v.pickupLocationId !== v.destinationLocationId, { message: "Pickup and destination must differ", path: ["destinationLocationId"] })
  .refine((v) => !v.returnDepartureTime || Date.parse(v.returnDepartureTime) > Date.parse(v.departureTime), {
    message: "Return departure must be after the outbound departure",
    path: ["returnDepartureTime"],
  });

export const cancelTripSchema = z.object({ status: z.literal("cancelled") }).strict();

/** Agreement fields are checked by the service so missing/stale terms map to 422 AGREEMENT_REQUIRED. */
export const joinTripSchema = z.object({
  agreementAccepted: z.boolean().optional(),
  agreementVersion: z.string().optional(),
});

export const leaveTripSchema = z.object({}).strict();

export const sendMessageSchema = z
  .object({ content: z.string() })
  .strict()
  .transform((v) => ({ content: v.content.trim() }))
  .refine((v) => v.content.length >= 1 && v.content.length <= CHAT_MAX_LENGTH, {
    message: `Messages must be 1–${CHAT_MAX_LENGTH} characters`,
    path: ["content"],
  });

export const reportNoShowSchema = z.object({ subjectId: idSchema, reason: z.literal("no_show") }).strict();

export const searchLocationsSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(120),
  cursor: z.string().max(200).optional(),
});

export const cursorOnlySchema = z.object({ cursor: z.string().max(200).optional() });
