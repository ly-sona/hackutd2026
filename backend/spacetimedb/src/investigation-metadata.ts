import type { Ctx } from "./index";
export function investigationMetadata(
  ctx: Ctx,
  org: string,
  inc: string,
  mode = "investigation",
  scenario = "",
) {
  const id = `${org}:${inc}`;
  if (!ctx.db.incidentInvestigations.id.find(id))
    ctx.db.incidentInvestigations.insert({
      id,
      organizationId: org,
      incidentId: inc,
      incidentKey: id,
      mode,
      scenario,
      referenceVersion: mode === "reference" ? "ir2041-reference-v1" : "",
      retired: ["acme:IR-2042", "acme:IR-2043"].includes(id),
    });
}
