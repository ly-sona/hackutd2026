import { NextRequest } from "next/server";
import { sessionHash } from "@/lib/server/session";
import { AccessError, command } from "@/lib/server/gateway";
import { recoveryQuery } from "@/lib/server/recovery";
import {
  verifyOrigin,
  boundedBody,
  incidentResponse,
  incidentError,
} from "@/lib/server/incident-http";
import { renderReport } from "@/lib/report-html";
import {
  storeEvidence,
  readEvidence,
  evidenceDigest,
} from "@/lib/server/evidence-store";
import type { ReportSnapshot } from "../../../../shared/recovery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const commands = [
  "start",
  "decide",
  "cancel",
  "trust",
  "classification",
  "close",
  "legal",
];
export async function POST(request: NextRequest) {
  try {
    verifyOrigin(request);
    const hash = await sessionHash();
    if (!hash) throw new AccessError("SESSION_EXPIRED", "Sign in to continue.");
    const data = JSON.parse(
      (await boundedBody(request, 32000)).toString("utf8"),
    ) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new AccessError("INVALID_INPUT", "Invalid request.");
    if (commands.includes(String(data.action)))
      return incidentResponse(
        await command(`recovery.${data.action}`, hash, data),
      );
    if (["report.preview", "fallback.records"].includes(String(data.action)))
      return incidentResponse(
        await recoveryQuery(hash, { ...data, operation: data.action }),
      );
    if (data.action === "report.generate" || data.action === "report.resume") {
      const { reportId } =
        data.action === "report.resume"
          ? { reportId: String(data.reportId ?? "") }
          : await command<{ reportId: string }>(
              "recovery.report.prepare",
              hash,
              data,
            );
      const { snapshot } = await recoveryQuery<{ snapshot: ReportSnapshot }>(
        hash,
        { ...data, operation: "report.prepared", reportId },
      );
      const bytes = Buffer.from(renderReport(snapshot), "utf8"),
        sha256 = evidenceDigest(bytes);
      let descriptor;
      try {
        descriptor = await storeEvidence(bytes, reportId);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        await readEvidence(reportId, sha256);
        descriptor = { storageReference: reportId, sha256, size: bytes.length };
      }
      await command("recovery.report.commit", hash, {
        ...data,
        reportId,
        ...descriptor,
      });
      return incidentResponse({ reportId });
    }
    throw new AccessError("INVALID_INPUT", "Unknown recovery action.");
  } catch (e) {
    return incidentError(e);
  }
}
