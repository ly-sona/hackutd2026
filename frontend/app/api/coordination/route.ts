import { NextRequest } from "next/server";
import { sessionHash } from "@/lib/server/session";
import { AccessError, command } from "@/lib/server/gateway";
import {
  verifyOrigin,
  boundedBody,
  incidentError,
  incidentResponse,
} from "@/lib/server/incident-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const actions = [
  "dm.create",
  "message.send",
  "message.read",
  "task.create",
  "task.update",
  "page.create",
  "page.acknowledge",
  "page.cancel",
  "availability",
  "finding.create",
];
export async function POST(request: NextRequest) {
  try {
    verifyOrigin(request);
    const hash = await sessionHash();
    if (!hash)
      throw new AccessError(
        "SESSION_EXPIRED",
        "Sign in to coordinate the incident.",
      );
    const raw = JSON.parse(
      (await boundedBody(request, 32000)).toString("utf8"),
    ) as Record<string, unknown>;
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      !actions.includes(String(raw.action))
    )
      throw new AccessError("INVALID_INPUT", "Unknown coordination action.");
    return incidentResponse(await command(`coord.${raw.action}`, hash, raw));
  } catch (error) {
    if (error instanceof AccessError && error.code === "CONFLICT")
      return incidentResponse({ error: error.message, code: error.code }, 409);
    return incidentError(error);
  }
}
