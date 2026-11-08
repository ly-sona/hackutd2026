import { NextRequest, NextResponse } from "next/server";
import { sessionHash } from "@/lib/server/session";
import { withGateway, unwrap, AccessError } from "@/lib/server/gateway";
import { readEvidence } from "@/lib/server/evidence-store";
import { incidentError } from "@/lib/server/incident-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Descriptor {
  id: string;
  storageReference: string;
  sha256: string;
  filename: string;
  contentType: string;
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const hash = await sessionHash();
    if (!hash)
      throw new AccessError("SESSION_EXPIRED", "Sign in to view evidence.");
    const id = (await context.params).id;
    const authorize = () =>
      withGateway(async (conn) =>
        unwrap<Descriptor>(
          await conn.procedures.evidenceDescriptor({
            sessionHash: hash,
            evidenceId: id,
          }),
        ),
      );
    const item = await authorize();
    const bytes = await readEvidence(item.storageReference, item.sha256);
    await authorize(); // Re-check revocation after file I/O, before sending original bytes.
    const inline =
      request.nextUrl.searchParams.get("preview") === "1" &&
      ["image/png", "image/jpeg", "text/plain", "application/json"].includes(
        item.contentType,
      );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": item.contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="evidence"; filename*=UTF-8''${encodeURIComponent(item.filename).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return incidentError(error);
  }
}
