import { NextRequest, NextResponse } from "next/server";
import { sessionHash } from "@/lib/server/session";
import { AccessError } from "@/lib/server/gateway";
import { recoveryQuery } from "@/lib/server/recovery";
import { readEvidence } from "@/lib/server/evidence-store";
import { incidentError } from "@/lib/server/incident-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const hash = await sessionHash();
    if (!hash)
      throw new AccessError("SESSION_EXPIRED", "Sign in to open the report.");
    const { id } = await params,
      payload = {
        operation: "report.descriptor",
        reportId: id,
        organizationId: request.nextUrl.searchParams.get("organizationId"),
        incidentId: request.nextUrl.searchParams.get("incidentId"),
      };
    const r = await recoveryQuery<{
        storageReference: string;
        sha256: string;
        filename: string;
      }>(hash, payload),
      bytes = await readEvidence(r.storageReference, r.sha256);
    await recoveryQuery(hash, payload);
    return new NextResponse(bytes.toString("utf8"), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${r.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox allow-modals",
      },
    });
  } catch (e) {
    return incidentError(e);
  }
}
