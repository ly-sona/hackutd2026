import { NextRequest } from "next/server";
import { sessionHash } from "@/lib/server/session";
import {
  AccessError,
  command,
  withGateway,
  unwrap,
} from "@/lib/server/gateway";
import {
  verifyOrigin,
  boundedBody,
  incidentError,
  incidentResponse,
} from "@/lib/server/incident-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const hash = await sessionHash();
    if (!hash)
      throw new AccessError("SESSION_EXPIRED", "Sign in to investigate scope.");
    const payload = Object.fromEntries(request.nextUrl.searchParams);
    return incidentResponse(
      await withGateway(async (conn) =>
        unwrap(
          await conn.procedures.scopeRead({
            sessionHash: hash,
            payload: JSON.stringify(payload),
          }),
        ),
      ),
    );
  } catch (error) {
    return incidentError(error);
  }
}
const actions = [
  "asset.create",
  "asset.update",
  "associate",
  "relationship",
  "assessment",
  "evidence.link",
  "finding",
];
export async function POST(request: NextRequest) {
  try {
    verifyOrigin(request);
    const hash = await sessionHash();
    if (!hash)
      throw new AccessError("SESSION_EXPIRED", "Sign in to investigate scope.");
    const raw = JSON.parse(
      (await boundedBody(request, 32000)).toString("utf8"),
    ) as Record<string, unknown>;
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      !actions.includes(String(raw.action))
    )
      throw new AccessError("INVALID_INPUT", "Unknown scope action.");
    return incidentResponse(await command(`scope.${raw.action}`, hash, raw));
  } catch (error) {
    return incidentError(error);
  }
}
