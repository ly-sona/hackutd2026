import { NextRequest } from "next/server";
import { sessionHash } from "@/lib/server/session";
import { AccessError, command } from "@/lib/server/gateway";
import {
  boundedBody,
  incidentError,
  incidentResponse,
  verifyOrigin,
} from "@/lib/server/incident-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    verifyOrigin(request);
    const hash = await sessionHash();
    if (!hash)
      throw new AccessError("SESSION_EXPIRED", "Sign in to investigate.");
    const body: unknown = JSON.parse(
      (await boundedBody(request, 12_000)).toString("utf8"),
    );
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new AccessError("INVALID_INPUT", "Invalid request.");
    const data = body as Record<string, unknown>;
    if (!["start", "cancel", "read"].includes(String(data.action)))
      throw new AccessError("INVALID_INPUT", "Unknown investigation action.");
    return incidentResponse(
      await command(`investigation.${data.action}`, hash, data),
    );
  } catch (error) {
    return incidentError(error);
  }
}
