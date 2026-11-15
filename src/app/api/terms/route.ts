import { AGREEMENT_TEXT, getConfig } from "@/config/env";
import { handle, ok } from "@/lib/api/http";
import { requireActor } from "@/lib/auth/session";
import type { AgreementTerms } from "@/types";

/** GET /api/terms → 200 AgreementTerms: active terms and version from server config (proposed addition). */
export async function GET() {
  return handle(async () => {
    await requireActor();
    const { agreementVersion, leaveCutoffMinutes } = getConfig();
    const terms: AgreementTerms = { version: agreementVersion, text: AGREEMENT_TEXT, leaveCutoffMinutes };
    return ok(terms);
  });
}
