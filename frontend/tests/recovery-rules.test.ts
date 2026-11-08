import { describe, it, expect } from "vitest";
import {
  policySatisfied,
  canRecoverTransition,
  trustCategory,
} from "../../shared/recovery";
import { escapeHtml, renderReport } from "../lib/report-html";
import type { ReportSnapshot } from "../../shared/recovery";
describe("independent recovery decisions", () => {
  const a = (userId: string, role: string, eligible = true) => ({
    userId,
    role,
    eligible,
    decision: "Approve",
  });
  it("requires analyst and commander; operations and administration cannot substitute", () => {
    expect(
      policySatisfied("technical_recovery", "jordan", [a("alex", "analyst")]),
    ).toBe(false);
    expect(
      policySatisfied("technical_recovery", "jordan", [
        a("alex", "analyst"),
        a("maya", "commander"),
      ]),
    ).toBe(true);
    expect(
      policySatisfied("technical_recovery", "jordan", [
        a("sam", "administrator"),
        a("maya", "commander"),
      ]),
    ).toBe(false);
  });
  it("rejects self approval, duplicate actors and revoked eligibility", () => {
    expect(
      policySatisfied("technical_recovery", "alex", [
        a("alex", "analyst"),
        a("maya", "commander"),
      ]),
    ).toBe(false);
    expect(
      policySatisfied("technical_recovery", "jordan", [
        a("alex", "analyst", false),
        a("maya", "commander"),
      ]),
    ).toBe(false);
    expect(
      policySatisfied("technical_recovery", "jordan", [
        a("alex", "analyst"),
        a("alex", "commander"),
      ]),
    ).toBe(false);
  });
  it("uses a distinct legal policy for sensitive exports", () => {
    expect(
      policySatisfied("sensitive_export", "alex", [
        a("maya", "commander"),
        a("priya", "legal"),
      ]),
    ).toBe(true);
    expect(
      policySatisfied("sensitive_export", "alex", [
        a("maya", "commander"),
        a("jordan", "operations"),
      ]),
    ).toBe(false);
  });
  it("does not infer do-not-use or verified safety from dependency paths", () => {
    expect(trustCategory(undefined, true)).toBe("Use With Caution");
    expect(trustCategory("Do Not Use", false)).toBe("Do Not Use");
    expect(trustCategory(undefined, false)).toBe("Available");
  });
  it("cannot turn failed verification into success or skip approvals", () => {
    expect(canRecoverTransition("Running", "Succeeded")).toBe(false);
    expect(canRecoverTransition("Failed", "Fallback Active")).toBe(false);
    expect(canRecoverTransition("Awaiting Verification", "Failed")).toBe(true);
  });
});
it("escapes untrusted report content in immutable printable HTML", () => {
  expect(escapeHtml('<script>"x"&')).toBe("&lt;script&gt;&quot;x&quot;&amp;");
  const snapshot: ReportSnapshot = {
    reportId: "id",
    type: "Executive Summary",
    version: 1,
    generatedAt: "2026-11-08",
    sourceCutoff: "2026-11-08",
    generatedBy: "maya",
    organizationId: "acme",
    organizationName: "Techniq",
    incidentId: "IR-1",
    incidentTitle: "<script>bad()</script>",
    audience: "Responders",
    confidentiality: "Confidential",
    sections: [],
    completeness: [],
    sourceIds: { evidence: ["EV-018"] },
    standards: [],
  };
  const html = renderReport(snapshot);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("@media print");
  expect(html).toContain("EV-018");
  expect(renderReport(snapshot)).toBe(html);
});
