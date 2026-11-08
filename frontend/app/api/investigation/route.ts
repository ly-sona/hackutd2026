import { NextRequest } from "next/server";
import { sessionHash } from "@/lib/server/session";
import { readEvidence } from "@/lib/server/evidence-store";
import type {
  ReviewedProposal,
  GroundedProposal,
} from "../../../../shared/agent-investigation";
import {
  AccessError,
  command,
  withGateway,
  unwrap,
} from "@/lib/server/gateway";
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
    if (
      ![
        "start",
        "refresh",
        "cancel",
        "read",
        "agent.start",
        "agent.cancel",
        "agent.read",
        "agent.review",
        "agent.assess",
        "agent.inspect",
        "agent.task",
      ].includes(String(data.action))
    )
      throw new AccessError("INVALID_INPUT", "Unknown investigation action.");
    if (data.action === "agent.assess") {
      const result = await command<{
        manifest: { snapshots: { evidenceId: string }[] };
      }>("investigation.agent.read", hash, { ...data, offset: 0, limit: 1 });
      for (const evidenceId of new Set(
        result.manifest.snapshots.map((s) => s.evidenceId),
      )) {
        const original = await withGateway(async (conn) =>
          unwrap<{ storageReference: string; sha256: string }>(
            await conn.procedures.evidenceDescriptor({
              sessionHash: hash,
              evidenceId,
            }),
          ),
        );
        await readEvidence(original.storageReference, original.sha256);
      }
    }
    if (data.action === "agent.review" && data.decision === "Accept") {
      const result = await command<{ rows: ReviewedProposal[] }>(
        "investigation.agent.read",
        hash,
        { ...data, offset: 0, limit: 50 },
      );
      const proposal = result.rows.find((p) => p.id === data.proposalId);
      if (!proposal)
        throw new AccessError("NOT_FOUND", "Proposal unavailable.");
      const content = JSON.parse(proposal.content) as GroundedProposal;
      for (const evidenceId of new Set(
        content.citations.map((c) => c.evidenceId),
      )) {
        const original = await withGateway(async (conn) =>
          unwrap<{ storageReference: string; sha256: string }>(
            await conn.procedures.evidenceDescriptor({
              sessionHash: hash,
              evidenceId,
            }),
          ),
        );
        await readEvidence(original.storageReference, original.sha256);
      }
      // The command below rechecks current human/source/destination authority
      // after private file I/O, and atomically persists the reviewed result.
    }
    return incidentResponse(
      await command(`investigation.${data.action}`, hash, data),
    );
  } catch (error) {
    return incidentError(error);
  }
}
