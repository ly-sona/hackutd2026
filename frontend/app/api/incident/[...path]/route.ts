import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { sessionHash } from "@/lib/server/session";
import { AccessError, command, snapshot } from "@/lib/server/gateway";
import {
  verifyOrigin,
  boundedBody,
  incidentResponse,
  incidentError,
} from "@/lib/server/incident-http";
import {
  MAX_EVIDENCE_BYTES,
  storeEvidence,
  removeEvidence,
  validateEvidence,
} from "@/lib/server/evidence-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const routes: Record<string, string> = {
  create: "create",
  update: "update",
  findings: "finding.create",
  "findings/update": "finding.update",
  note: "note",
  read: "read",
  visit: "visit",
  link: "link",
};
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  let stored: string | undefined;
  try {
    verifyOrigin(request);
    const hash = await sessionHash();
    if (!hash) throw new AccessError("SESSION_EXPIRED", "Sign in to continue.");
    const path = (await context.params).path.join("/");
    if (path === "evidence") {
      const org = request.nextUrl.searchParams.get("organizationId") ?? "",
        inc = request.nextUrl.searchParams.get("incidentId") ?? "";
      if (!org || !inc)
        throw new AccessError(
          "INVALID_INPUT",
          "Select an organization and incident.",
        );
      await snapshot(hash, org, inc, "evidence:upload");
      const bytes = await boundedBody(request, MAX_EVIDENCE_BYTES + 65536);
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
        body: bytes,
      }).formData();
      const file = form.get("file");
      const note = form.get("note");
      let filename: string, content: Uint8Array, suppliedType: string;
      if (file instanceof File && file.size) {
        filename = file.name;
        content = new Uint8Array(await file.arrayBuffer());
        suppliedType = file.type;
      } else if (typeof note === "string" && note.trim()) {
        filename = "investigation-note.txt";
        content = new TextEncoder().encode(note);
        suppliedType = "text/plain";
      } else
        throw new AccessError(
          "INVALID_INPUT",
          "Choose a file or enter an evidence note.",
        );
      const contentType = validateEvidence(filename, suppliedType, content);
      const field = (name: string, max: number, optional = false) => {
        const v = form.get(name);
        if (optional && (v === null || v === "")) return "";
        if (typeof v !== "string" || !v.trim() || v.length > max)
          throw new AccessError("INVALID_INPUT", `Invalid ${name}.`);
        return v.trim();
      };
      const metadata = {
        description: field("description", 4000),
        source: field("source", 1000),
        status: field("status", 100),
        findingId: field("findingId", 100, true),
        annotation: field("annotation", 2000, true),
        excerpt: field("excerpt", 2000, true),
        collectedAt: field("collectedAt", 30, true),
      };
      const original = await storeEvidence(content);
      stored = original.storageReference;
      const result = await command("incident.evidence", hash, {
        organizationId: org,
        incidentId: inc,
        id: `EV-${randomUUID()}`,
        filename,
        contentType,
        ...original,
        ...metadata,
      });
      stored = undefined;
      return incidentResponse(result);
    }
    if (!routes[path]) return incidentResponse({ error: "Not found." }, 404);
    const body = JSON.parse(
      (await boundedBody(request, 32000)).toString("utf8"),
    ) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new AccessError("INVALID_INPUT", "Expected an object.");
    return incidentResponse(
      await command(`incident.${routes[path]}`, hash, body),
    );
  } catch (error) {
    // A transport failure can occur after the DB committed. Preserve the private original
    // on an uncertain outcome; deleting it could break committed evidence metadata.
    if (stored && error instanceof AccessError && error.code !== "UNAVAILABLE")
      await removeEvidence(stored);
    return incidentError(error);
  }
}
