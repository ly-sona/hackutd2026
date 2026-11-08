import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DbConnection } from "../../src/module_bindings";
import { command } from "../../lib/server/gateway";
import { tokenHash } from "../../lib/server/password";
import type {
  RecoveryExecution,
  ApprovalRequest,
  RecoveryStep,
  Warning,
  FallbackGrant,
  SavedReport,
  BusinessOperation,
} from "../../lib/recovery";
import type { ReportSnapshot } from "../../../shared/recovery";
import type { Task } from "../../lib/coordination";
const origin = "http://127.0.0.1:3100",
  base = "/org/acme/incidents/IR-2041",
  scope = { organizationId: "acme", incidentId: "IR-2041" },
  root = resolve(process.cwd(), "..");
function configure() {
  const g = JSON.parse(
    readFileSync(resolve(root, ".spacetime/e2e/gateway.json"), "utf8"),
  );
  process.env.SPACETIMEDB_SERVER_TOKEN = g.token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
}
async function login(c: BrowserContext, id: string) {
  const p = (
    JSON.parse(
      readFileSync(resolve(root, ".spacetime/e2e/demo-accounts.json"), "utf8"),
    ) as { id: string; login: string; password: string }[]
  ).find((p) => p.id === id)!;
  expect(
    (
      await c.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { login: p.login, password: p.password },
      })
    ).status(),
  ).toBe(200);
}
const post = (
  r: APIRequestContext,
  action: string,
  data: object = {},
  operationId: string = randomUUID(),
) =>
  r.post("/api/recovery", {
    headers: { Origin: origin },
    data: { ...scope, action, ...data, operationId },
  });
async function ok<T = Record<string, string>>(
  r: APIRequestContext,
  action: string,
  data: object = {},
  id?: string,
): Promise<T> {
  const response = await post(r, action, data, id);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
const hash = async (c: BrowserContext) =>
  tokenHash((await c.cookies()).find((c) => c.name === "aegis_session")!.value);
async function live(c: BrowserContext) {
  const conn = await new Promise<DbConnection>((resolve, reject) =>
    DbConnection.builder()
      .withUri("http://127.0.0.1:3101")
      .withDatabaseName("aegis-e2e")
      .onConnect(resolve)
      .onConnectError((_, e) => reject(e))
      .build(),
  );
  expect(
    (
      await c.request.post("/api/connection/bind", {
        headers: { Origin: origin },
        data: { identity: conn.identity!.toHexString() },
      })
    ).status(),
  ).toBe(200);
  await new Promise<void>((resolve, reject) =>
    conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(reject)
      .subscribe([
        "SELECT * FROM visible_recovery_data",
        "SELECT * FROM visible_incident_data",
        "SELECT * FROM visible_coordination_data",
        "SELECT * FROM visible_scope_data",
      ]),
  );
  return {
    conn,
    rows: <T>(kind: string) =>
      [...conn.db.visibleRecoveryData.iter()]
        .filter((r) => r.kind === kind && r.incidentId === "IR-2041")
        .map((r) => JSON.parse(r.body) as T),
    tasks: () =>
      [...conn.db.visibleCoordinationData.iter()]
        .filter((r) => r.kind === "task")
        .map((r) => JSON.parse(r.body) as Task),
  };
}
type Live = Awaited<ReturnType<typeof live>>;
async function awaitRequest(d: Live, id: string) {
  await expect
    .poll(
      () =>
        d.rows<RecoveryExecution>("execution").find((e) => e.id === id)?.state,
    )
    .toBe("Awaiting Approval");
  const e = d.rows<RecoveryExecution>("execution").find((e) => e.id === id)!;
  return d.rows<ApprovalRequest>("request").find((r) => r.id === e.approvalId)!;
}
async function approve(c: BrowserContext, r: ApprovalRequest) {
  return ok(c.request, "decide", {
    requestId: r.id,
    revisionToken: r.revisionToken,
    decision: "Approve",
    justification:
      "Reviewed current evidence, immutable parameters and synthetic verification boundaries.",
  });
}
async function start(c: BrowserContext, fallback = false, parent = "") {
  return ok(c.request, "start", {
    templateId: fallback ? "temporary-support" : "restore-support",
    entityId: "acme:scope:OP-SUPPORT",
    justification:
      "Restore limited independent customer-support capability with explicit human review.",
    beneficiaryIds: fallback ? ["jordan"] : [],
    parentExecutionId: parent,
  });
}
async function cancelActive(c: BrowserContext, d: Live) {
  for (const e of d.rows<RecoveryExecution>("execution"))
    if (!["Succeeded", "Failed", "Canceled"].includes(e.state))
      await ok(c.request, "cancel", {
        executionId: e.id,
        justification: "Isolated browser test cleanup; preserve history.",
      });
}
test.describe("Phase 5 evidence, approved recovery and immutable reports", () => {
  test.beforeAll(async () => {
    configure();
    await command("test_restore_memberships", "", {});
  });
  test.afterEach(async () => {
    await command("test_restore_memberships", "", {});
  });
  test("requires independent approvals, persists failure, reuses original evidence and activates only an expiring independent subset", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      jordan = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(jordan, "jordan");
    const d = await live(maya);
    try {
      await cancelActive(maya, d);
      await command("recovery.demo.profile", "", {
        ...scope,
        profile: "failure",
      });
      const original = await maya.request.get("/api/evidence/EV-018"),
        bytes = await original.body();
      expect(original.status()).toBe(200);
      const w = d
        .rows<Warning>("warning")
        .find((w) => w.entityId === "acme:scope:SYS-CUSTOMER-DB")!;
      expect(w.category).toBe("Do Not Use");
      expect(w.evidenceIds).toContain("EV-018");
      expect(
        d.rows<Warning>("warning").filter((w) => w.category === "Do Not Use")
          .length,
      ).toBeGreaterThanOrEqual(3);
      const sso = d
        .rows<Warning>("warning")
        .find((w) => w.entityId === "acme:scope:ID-SSO")!;
      expect(sso.category).toBe("Do Not Use");
      expect(sso.evidenceIds).toEqual(["EV-018"]);
      expect(sso.explanation).toContain("does not confirm");
      const requestId = randomUUID(),
        payload = {
          templateId: "restore-support",
          entityId: "acme:scope:OP-SUPPORT",
          justification: "Independent simulation test.",
          beneficiaryIds: [],
        };
      const first = await ok(jordan.request, "start", payload, requestId);
      expect(await ok(jordan.request, "start", payload, requestId)).toEqual(
        first,
      );
      expect(
        (
          await post(
            jordan.request,
            "start",
            { ...payload, justification: "Changed" },
            requestId,
          )
        ).status(),
      ).toBe(400);
      const r = await awaitRequest(d, first.executionId);
      expect(
        (
          await post(jordan.request, "decide", {
            requestId: r.id,
            revisionToken: r.revisionToken,
            decision: "Approve",
            justification: "Self approval denied.",
          })
        ).status(),
      ).toBe(403);
      await approve(alex, r);
      expect(
        (
          await post(alex.request, "decide", {
            requestId: r.id,
            revisionToken: r.revisionToken,
            decision: "Approve",
            justification: "Duplicate denied.",
          })
        ).status(),
      ).toBe(400);
      expect(
        d
          .rows<RecoveryExecution>("execution")
          .find((e) => e.id === first.executionId)?.state,
      ).toBe("Awaiting Approval");
      await approve(maya, r);
      await expect
        .poll(
          () =>
            d
              .rows<RecoveryExecution>("execution")
              .find((e) => e.id === first.executionId)?.state,
        )
        .toBe("Failed");
      const failed = d
        .rows<RecoveryExecution>("execution")
        .find((e) => e.id === first.executionId)!;
      expect(d.tasks().find((t) => t.id === failed.taskId)?.status).toBe(
        "Open",
      );
      expect(
        d
          .rows<RecoveryStep>("step")
          .filter((s) => s.executionId === failed.id)
          .some((s) => s.evidenceId === "EV-REC-FAILURE"),
      ).toBe(true);
      expect(
        await (await maya.request.get("/api/evidence/EV-018")).body(),
      ).toEqual(bytes);
      const fallback = await start(jordan, true, failed.id),
        fr = await awaitRequest(d, fallback.executionId);
      await approve(alex, fr);
      await approve(maya, fr);
      await expect
        .poll(
          () =>
            d
              .rows<RecoveryExecution>("execution")
              .find((e) => e.id === fallback.executionId)?.state,
        )
        .toBe("Fallback Active");
      const safe = await ok<{ records: { id: string }[]; accessLevel: string }>(
        jordan.request,
        "fallback.records",
        { executionId: fallback.executionId },
      );
      expect(safe.accessLevel).toBe("Read Only");
      expect(safe.records.map((r) => r.id)).toEqual([
        "SAFE-001",
        "SAFE-002",
        "SAFE-003",
      ]);
      expect(
        (
          await post(alex.request, "fallback.records", {
            executionId: fallback.executionId,
          })
        ).status(),
      ).toBe(403);
      expect(
        d
          .rows<Warning>("warning")
          .find((w) => w.entityId === "acme:scope:SYS-CUSTOMER-DB")?.category,
      ).toBe("Do Not Use");
      expect(
        d
          .rows<BusinessOperation>("operation")
          .find((o) => o.entityId === "acme:scope:OP-SUPPORT")?.operatingMode,
      ).toContain("fallback");
      const g = d
        .rows<FallbackGrant>("grant")
        .find((g) => g.executionId === fallback.executionId)!;
      await command("recovery.test.expire_access", "", { id: g.id });
      expect(
        (
          await post(jordan.request, "fallback.records", {
            executionId: fallback.executionId,
          })
        ).status(),
      ).toBe(403);
      await expect
        .poll(
          () =>
            d
              .rows<RecoveryExecution>("execution")
              .find((e) => e.id === fallback.executionId)?.state,
        )
        .toBe("Canceled");
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
      await jordan.close();
    }
  });
  test("blocks expired, changed and revoked approvals and never lets a client select fixture outcomes", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      jordan = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(jordan, "jordan");
    const d = await live(maya);
    try {
      await cancelActive(maya, d);
      const first = await start(jordan),
        r = await awaitRequest(d, first.executionId);
      await command("recovery.test.expire_approval", "", { id: r.id });
      expect(
        (
          await post(alex.request, "decide", {
            requestId: r.id,
            revisionToken: r.revisionToken,
            decision: "Approve",
            justification: "Expired approval denied.",
          })
        ).status(),
      ).toBe(400);
      await expect
        .poll(
          () =>
            d
              .rows<RecoveryExecution>("execution")
              .find((e) => e.id === first.executionId)?.state,
        )
        .toBe("Failed");
      const second = await start(jordan),
        r2 = await awaitRequest(d, second.executionId);
      await approve(alex, r2);
      await command("test_remove_incident", "", { userId: "alex" });
      await expect
        .poll(
          () =>
            d
              .rows<RecoveryExecution>("execution")
              .find((e) => e.id === second.executionId)?.state,
        )
        .toBe("Failed");
      await command("test_restore_memberships", "", {});
      const third = await start(jordan),
        r3 = await awaitRequest(d, third.executionId);
      expect(
        (
          await post(maya.request, "decide", {
            requestId: r3.id,
            revisionToken: "stale",
            decision: "Approve",
            justification: "Stale context denied.",
          })
        ).status(),
      ).toBe(400);
      expect(
        (
          await post(maya.request, "demo.profile", { profile: "success" })
        ).status(),
      ).toBe(400);
      expect(
        (
          await post(maya.request, "test.expire_access", { id: "anything" })
        ).status(),
      ).toBe(400);
      await ok(maya.request, "cancel", {
        executionId: third.executionId,
        justification: "Preserve canceled test execution.",
      });
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
      await jordan.close();
    }
  });
  test("completes successful approved recovery without clearing original warnings, tasks, findings or scope", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      jordan = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(jordan, "jordan");
    const d = await live(maya);
    try {
      await cancelActive(maya, d);
      await command("recovery.demo.profile", "", {
        ...scope,
        profile: "success",
      });
      const before = [...d.conn.db.visibleScopeData.iter()]
        .filter((r) => r.kind === "assessment")
        .map((r) => r.body)
        .sort();
      const startResult = await start(jordan),
        r = await awaitRequest(d, startResult.executionId);
      await approve(alex, r);
      await approve(maya, r);
      await jordan.close();
      await expect
        .poll(
          () =>
            d
              .rows<RecoveryExecution>("execution")
              .find((e) => e.id === startResult.executionId)?.state,
        )
        .toBe("Succeeded");
      expect(
        [...d.conn.db.visibleScopeData.iter()]
          .filter((r) => r.kind === "assessment")
          .map((r) => r.body)
          .sort(),
      ).toEqual(before);
      expect(
        d
          .tasks()
          .find(
            (t) =>
              t.id ===
              d
                .rows<RecoveryExecution>("execution")
                .find((e) => e.id === startResult.executionId)?.taskId,
          )?.status,
      ).toBe("Open");
      expect(
        d
          .rows<Warning>("warning")
          .find((w) => w.entityId === "acme:scope:SYS-CUSTOMER-DB")?.category,
      ).toBe("Do Not Use");
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
      await jordan.close();
      await command("recovery.demo.profile", "", {
        ...scope,
        profile: "failure",
      });
    }
  });
  test("reviews completeness, generates both HTML formats and preserves historical bytes after new verified evidence", async ({
    browser,
  }) => {
    const maya = await browser.newContext();
    await login(maya, "maya");
    const d = await live(maya);
    try {
      const preview = await ok<ReportSnapshot>(maya.request, "report.preview", {
        type: "Detailed Incident Report",
        includeLegal: true,
      });
      expect(preview.sections).toHaveLength(8);
      expect(
        preview.completeness.find((c) => c.label === "Root cause")?.status,
      ).toBe("Not Yet Established");
      expect(
        preview.sections
          .find((s) => s.id === "scope")
          ?.fields.find((f) => f.label === "Dataset inventory")?.value,
      ).toBe("1240");
      expect(JSON.stringify(preview)).not.toContain("storageReference");
      const generated = await ok(maya.request, "report.generate", {
        type: "Detailed Incident Report",
        includeLegal: true,
      });
      const url = `/api/reports/${generated.reportId}?organizationId=acme&incidentId=IR-2041`,
        v1 = await maya.request.get(url);
      expect(v1.status()).toBe(200);
      const bytes = await v1.body();
      expect(bytes.toString()).toContain("Report Completeness Review");
      expect(bytes.toString()).toContain("EV-018");
      expect(bytes.toString()).toContain("Not yet established");
      await expect
        .poll(() =>
          d
            .rows<SavedReport>("report")
            .some((r) => r.id === generated.reportId && r.status === "Ready"),
        )
        .toBe(true);
      const saved = d
        .rows<SavedReport>("report")
        .find((r) => r.id === generated.reportId)!;
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        saved.sha256,
      );
      const upload = await maya.request.post(
        "/api/incident/evidence?organizationId=acme&incidentId=IR-2041",
        {
          headers: { Origin: origin },
          multipart: {
            file: {
              name: "post-recovery-observation.txt",
              mimeType: "text/plain",
              buffer: Buffer.from(
                "New independently reviewed synthetic recovery observation.",
              ),
            },
            description: "Post-recovery verification observation.",
            source: "Synthetic report version test",
            status: "Unverified",
            collectedAt: String(Date.now()),
          },
        },
      );
      expect(upload.status(), await upload.text()).toBe(200);
      const evidenceId = (await upload.json()).evidenceId;
      const finding = await maya.request.post("/api/incident/findings", {
        headers: { Origin: origin },
        data: {
          ...scope,
          title: "New verified observation for report version " + randomUUID(),
          description:
            "Observed synthetic verification result; no original compromise cleared.",
          category: "Verification",
          priority: "Medium",
          status: "Confirmed",
          observedAt: Date.now(),
          relatedSystem: "Customer Database",
          assignedTo: "alex",
          evidenceIds: [evidenceId],
          reason: "Human reviewed the independent original artifact.",
        },
      });
      expect(finding.status(), await finding.text()).toBe(200);
      const findingId = (await finding.json()).findingId;
      const newer = await ok(maya.request, "report.generate", {
          type: "Detailed Incident Report",
          includeLegal: true,
        }),
        v2 = await maya.request.get(
          `/api/reports/${newer.reportId}?organizationId=acme&incidentId=IR-2041`,
        );
      expect(v2.status()).toBe(200);
      expect(await v2.text()).toContain(findingId);
      expect(bytes.toString()).not.toContain(findingId);
      expect(await (await maya.request.get(url)).body()).toEqual(bytes);
      const executive = await ok(maya.request, "report.generate", {
        type: "Executive Summary",
        includeLegal: false,
      });
      expect(
        (
          await maya.request.get(
            `/api/reports/${executive.reportId}?organizationId=acme&incidentId=IR-2041&download=1`,
          )
        ).headers()["content-disposition"],
      ).toContain("attachment");
      const page = await maya.newPage();
      await page.goto(base + "/timeline");
      await expect(
        page.getByRole("heading", {
          name: "Incident report history",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: `Open version ${saved.version}`,
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      d.conn.disconnect();
      await maya.close();
    }
  });
  test("allows administrator reports while denying unauthorized sources and preserving private tables", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      sam = await browser.newContext(),
      jordan = await browser.newContext(),
      anonymous = await browser.newContext();
    await login(maya, "maya");
    await login(sam, "sam");
    await login(jordan, "jordan");
    const d = await live(maya);
    try {
      const r = await ok(maya.request, "report.generate", {
          type: "Executive Summary",
          includeLegal: false,
        }),
        url = `/api/reports/${r.reportId}?organizationId=acme&incidentId=IR-2041`;
      expect((await anonymous.request.get(url)).status()).toBe(401);
      expect((await sam.request.get(url)).status()).toBe(200);
      expect((await jordan.request.get(url)).status()).toBe(403);
      expect(
        (await maya.request.get(url.replace("IR-2041", "IR-2042"))).status(),
      ).toBe(404);
      await cancelActive(maya, d);
      const started = await ok(sam.request, "start", {
        templateId: "restore-support",
        entityId: "acme:scope:OP-SUPPORT",
        justification:
          "Administrator can request recovery; independent approvals remain required.",
      });
      const request = await awaitRequest(d, started.executionId);
      expect(
        (
          await post(sam.request, "decide", {
            requestId: request.id,
            revisionToken: request.revisionToken,
            decision: "Approve",
            justification: "Self approval must remain denied.",
          })
        ).status(),
      ).toBe(403);
      await cancelActive(maya, d);
      await command("test_remove_incident", "", { userId: "maya" });
      expect((await maya.request.get(url)).status()).toBe(403);
      await command("test_restore_memberships", "", {});
      for (const table of [
        "trust_restrictions",
        "business_operations",
        "recovery_templates",
        "recovery_executions",
        "recovery_steps",
        "approval_requests",
        "approval_decisions",
        "fallback_access",
        "safe_support_records",
        "recovery_fixtures",
        "recovery_simulation_state",
        "recovery_execution_internals",
        "recovery_operations",
        "incident_reporting_metadata",
        "incident_reports",
        "report_snapshots",
        "legal_reviews",
      ]) {
        const res = await fetch(
          `http://127.0.0.1:3101/v1/database/aegis-e2e/sql`,
          { method: "POST", body: `SELECT * FROM ${table}` },
        );
        expect(res.ok).toBe(false);
      }
      const unbound = await new Promise<DbConnection>((resolve, reject) =>
        DbConnection.builder()
          .withUri("http://127.0.0.1:3101")
          .withDatabaseName("aegis-e2e")
          .onConnect(resolve)
          .onConnectError((_, e) => reject(e))
          .build(),
      );
      try {
        await expect(
          unbound.procedures.recoveryRead({
            sessionHash: await hash(maya),
            payload: JSON.stringify({
              ...scope,
              operation: "report.preview",
              type: "Executive Summary",
            }),
          }),
        ).rejects.toContain("Trusted server required");
      } finally {
        unbound.disconnect();
      }
    } finally {
      d.conn.disconnect();
      await maya.close();
      await sam.close();
      await jordan.close();
      await anonymous.close();
    }
  });
  test("renders Operations and real evidence-backed report controls on desktop", async ({
    context,
    page,
  }) => {
    await login(context, "maya");
    await page.goto(base + "/operations");
    await expect(
      page.getByRole("heading", { name: "Operations", exact: true }),
    ).toBeVisible();
    await page
      .locator("summary")
      .filter({ hasText: "Business continuity reports" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Affected operations", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "New request", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Restore Customer Support Capability",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.goto(base + "/overview");
    await expect(
      page.getByRole("button", { name: "Generate report", exact: true }),
    ).toHaveCount(0);
    await page.goto(base + "/timeline");
    await expect(
      page.getByRole("heading", { name: "Incident report history", exact: true }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Generate report", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Generate incident report" });
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Review completeness/ })).toHaveCount(0);
    await expect(dialog).toContainText("Restricted legal review is included automatically");
    const artifacts: string[] = [];
    for (const type of ["Executive Summary", "Detailed Incident Report"]) {
      await dialog.getByRole("combobox", { name: "Report type", exact: true }).selectOption(type);
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/api/recovery") && r.request().postDataJSON()?.action === "report.generate",
      );
      await dialog.getByRole("button", { name: "Generate", exact: true }).click();
      const result = await response;
      expect(result.status(), await result.text()).toBe(200);
      expect(result.request().postDataJSON().includeLegal).toBe(true);
      const { reportId } = await result.json();
      await expect(dialog.getByRole("status")).toContainText("Report saved");
      const artifact = await context.request.get(`/api/reports/${reportId}?organizationId=acme&incidentId=IR-2041`);
      expect(artifact.status()).toBe(200);
      const html = await artifact.text();
      expect(html).toContain("legal");
      expect(html).toContain("Not Yet Established");
      artifacts.push(reportId);
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    for (const id of artifacts) {
      await expect(page.locator(`a[href^="/api/reports/${id}?"]`)).toHaveCount(2);
    }
    await expect(page.getByRole("heading", { name: "Incident report history", exact: true })).toHaveCount(1);
  });
});

test("excludes private DM-derived sources even from participant-generated reports and keeps legal artifacts permission restricted", async ({
  browser,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  const maya = await browser.newContext(),
    alex = await browser.newContext();
  await login(maya, "maya");
  await login(alex, "alex");
  try {
    const cp = async (action: string, data: object) => {
      const r = await maya.request.post("/api/coordination", {
        headers: { Origin: origin },
        data: { ...scope, action, clientRequestId: randomUUID(), ...data },
      });
      expect(r.status(), await r.text()).toBe(200);
      return r.json();
    };
    const dm = await cp("dm.create", { userId: "alex" }),
      privateText = "Confidential derived report exclusion " + randomUUID(),
      message = await cp("message.send", {
        conversationId: dm.conversationId,
        content: privateText,
        references: [{ kind: "evidence", id: "EV-018" }],
      });
    const finding = await cp("finding.create", {
      title: privateText,
      description: privateText,
      category: "Observation",
      priority: "High",
      status: "Suspected",
      observedAt: Date.now(),
      assignedTo: "alex",
      relatedSystem: "Customer Database",
      reason: "Private source remains restricted.",
      sourceMessageId: message.messageId,
      references: [{ kind: "evidence", id: "EV-018" }],
      evidenceIds: ["EV-018"],
    });
    const preview = await ok<ReportSnapshot>(maya.request, "report.preview", {
      type: "Detailed Incident Report",
      includeLegal: false,
    });
    expect(JSON.stringify(preview)).not.toContain(privateText);
    expect(preview.sourceIds.findings).not.toContain(finding.findingId);
    const r = await ok(maya.request, "report.generate", {
        type: "Detailed Incident Report",
        includeLegal: true,
      }),
      url = `/api/reports/${r.reportId}?organizationId=acme&incidentId=IR-2041`;
    expect((await alex.request.get(url)).status()).toBe(403);
    const saved = await maya.request.get(url);
    expect(saved.status()).toBe(200);
    expect(await saved.text()).not.toContain(privateText);
  } finally {
    await maya.close();
    await alex.close();
  }
});

test("invalidates an approved context when trust evidence changes and records a real trust event", async ({
  browser,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  const maya = await browser.newContext(),
    alex = await browser.newContext(),
    jordan = await browser.newContext();
  await login(maya, "maya");
  await login(alex, "alex");
  await login(jordan, "jordan");
  const d = await live(maya);
  try {
    await cancelActive(maya, d);
    const started = await start(jordan),
      r = await awaitRequest(d, started.executionId);
    await approve(alex, r);
    const reason = "Evidence-backed usage restriction reviewed " + randomUUID();
    await ok(maya.request, "trust", {
      entityId: "acme:scope:SYS-CUSTOMER-DB",
      category: "Do Not Use",
      justification: reason,
      evidenceIds: ["EV-018"],
    });
    expect(
      (
        await post(maya.request, "decide", {
          requestId: r.id,
          revisionToken: r.revisionToken,
          decision: "Approve",
          justification: "Prior evidence context is stale.",
        })
      ).status(),
    ).toBe(400);
    await expect
      .poll(
        () =>
          d
            .rows<RecoveryExecution>("execution")
            .find((e) => e.id === started.executionId)?.state,
      )
      .toBe("Failed");
    expect(
      [...d.conn.db.visibleIncidentData.iter()]
        .filter((r) => r.kind === "event")
        .some((r) => r.body.includes(reason)),
    ).toBe(true);
  } finally {
    d.conn.disconnect();
    await maya.close();
    await alex.close();
    await jordan.close();
  }
});

test("requires a separate evidence-backed closure decision and never bypasses it through incident status editing", async ({
  browser,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  const maya = await browser.newContext(),
    alex = await browser.newContext(),
    priya = await browser.newContext();
  await login(maya, "maya");
  await login(alex, "alex");
  await login(priya, "priya");
  try {
    const created = await maya.request.post("/api/incident/create", {
      headers: { Origin: origin },
      data: {
        organizationId: "acme",
        title: "Separate closure verification " + randomUUID(),
        description: "Synthetic closure policy fixture.",
        type: "Other",
        severity: "High",
        discoveredAt: Date.now(),
        commanderId: "maya",
        systems: "",
        impact: "",
        responderIds: ["alex", "priya"],
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const incidentId = (await created.json()).incidentId;
    const update = await maya.request.post("/api/incident/update", {
      headers: { Origin: origin },
      data: {
        organizationId: "acme",
        incidentId,
        description: "Synthetic closure policy fixture.",
        severity: "High",
        status: "Closed",
        commanderId: "maya",
        reason: "Attempt direct closure",
      },
    });
    expect(update.status()).toBe(403);
    const upload = await maya.request.post(
      `/api/incident/evidence?organizationId=acme&incidentId=${incidentId}`,
      {
        headers: { Origin: origin },
        multipart: {
          note: "Human-reviewed synthetic incident closure note.",
          description: "Explicit closure review evidence.",
          source: "Synthetic reviewer",
          status: "Unverified",
          collectedAt: String(Date.now()),
        },
      },
    );
    expect(upload.status(), await upload.text()).toBe(200);
    const evidenceId = (await upload.json()).evidenceId;
    const closure = await ok(priya.request, "close", {
      incidentId,
      justification:
        "Human review supports closure of this isolated synthetic incident. No automatic recovery conclusion.",
      evidenceIds: [evidenceId],
    });
    const conn = await new Promise<DbConnection>((resolve, reject) =>
      DbConnection.builder()
        .withUri("http://127.0.0.1:3101")
        .withDatabaseName("aegis-e2e")
        .onConnect(resolve)
        .onConnectError((_, e) => reject(e))
        .build(),
    );
    try {
      expect(
        (
          await maya.request.post("/api/connection/bind", {
            headers: { Origin: origin },
            data: { identity: conn.identity!.toHexString() },
          })
        ).status(),
      ).toBe(200);
      await new Promise<void>((resolve, reject) =>
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve())
          .onError(reject)
          .subscribe([
            "SELECT * FROM visible_recovery_data",
            "SELECT * FROM visible_incident_data",
          ]),
      );
      const request = [...conn.db.visibleRecoveryData.iter()]
        .filter((r) => r.kind === "request")
        .map((r) => JSON.parse(r.body) as ApprovalRequest)
        .find((r) => r.id === closure.requestId)!;
      expect(request.policy).toBe("close_incident");
      for (const c of [alex, maya])
        await ok(c.request, "decide", {
          incidentId,
          requestId: request.id,
          revisionToken: request.revisionToken,
          decision: "Approve",
          justification:
            "Independent explicit closure approval; preserve existing findings and history.",
        });
      await expect
        .poll(
          () =>
            [...conn.db.visibleIncidentData.iter()]
              .filter(
                (r) => r.kind === "incident" && r.incidentId === incidentId,
              )
              .map((r) => JSON.parse(r.body) as { status: string })[0]?.status,
        )
        .toBe("Closed");
    } finally {
      conn.disconnect();
    }
  } finally {
    await maya.close();
    await alex.close();
    await priya.close();
  }
});

test("resumes a reserved report after interrupted artifact preparation without creating a new version", async ({
  context,
  page,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  await login(context, "maya");
  const d = await live(context);
  try {
    const pending = await command<{ reportId: string }>(
      "recovery.report.prepare",
      await hash(context),
      {
        ...scope,
        operationId: randomUUID(),
        type: "Executive Summary",
        includeLegal: false,
      },
    );
    await expect
      .poll(
        () =>
          d.rows<SavedReport>("report").find((r) => r.id === pending.reportId)
            ?.status,
      )
      .toBe("Preparing");
    const version = d
      .rows<SavedReport>("report")
      .find((r) => r.id === pending.reportId)!.version;
    expect(
      (
        await post(context.request, "report.prepare", {
          type: "Executive Summary",
        })
      ).status(),
    ).toBe(400);
    await page.goto(base + "/timeline");
    await page
      .getByRole("button", { name: `Resume version ${version}`, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: `Open version ${version}`, exact: true }),
    ).toBeVisible();
    expect(
      d.rows<SavedReport>("report").filter((r) => r.id === pending.reportId),
    ).toHaveLength(1);
    const url = `/api/reports/${pending.reportId}?organizationId=acme&incidentId=IR-2041`,
      original = await context.request.get(url);
    expect(original.status()).toBe(200);
    const bytes = await original.body();
    await ok(context.request, "report.resume", { reportId: pending.reportId });
    expect(await (await context.request.get(url)).body()).toEqual(bytes);
    expect(
      d.rows<SavedReport>("report").find((r) => r.id === pending.reportId)
        ?.version,
    ).toBe(version);
  } finally {
    d.conn.disconnect();
  }
});

test("lets humans review bound workflow parameters and approve a real request through separate browser sessions", async ({
  browser,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  const maya = await browser.newContext(),
    alex = await browser.newContext(),
    jordan = await browser.newContext();
  await login(maya, "maya");
  await login(alex, "alex");
  await login(jordan, "jordan");
  const d = await live(maya);
  try {
    await cancelActive(maya, d);
    await command("recovery.demo.profile", "", {
      ...scope,
      profile: "failure",
    });
    const jp = await jordan.newPage();
    await jp.goto(base + "/operations");
    await jp.getByRole("button", { name: "New request", exact: true }).click();
    await jp
      .getByRole("dialog")
      .getByLabel("Justification", { exact: true })
      .fill("Human UI recovery review " + randomUUID());
    await jp
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(jp.getByRole("dialog")).not.toBeVisible();
    await expect
      .poll(
        () =>
          d
            .rows<RecoveryExecution>("execution")
            .find((e) => e.state === "Awaiting Approval")?.requestedBy,
      )
      .toBe("jordan");
    const execution = d
        .rows<RecoveryExecution>("execution")
        .find((e) => e.state === "Awaiting Approval")!,
      request = d
        .rows<ApprovalRequest>("request")
        .find((r) => r.id === execution.approvalId)!;
    for (const c of [alex, maya]) {
      const p = await c.newPage();
      await p.goto(base + "/operations");
      await p
        .getByRole("button")
        .filter({ hasText: request.displayReference })
        .click();
      await p
        .locator("summary")
        .filter({ hasText: "Fallback rationale & evidence" })
        .click();
      await expect(p.getByLabel("Bound approval parameters")).toContainText(
        "Human UI recovery review",
      );
      await expect(p.getByText(/^Security Engineer(?: · Eligible reviewer)?$/)).toBeVisible();
      await expect(p.getByText(/^Incident Manager(?: · Eligible reviewer)?$/)).toBeVisible();
      await p
        .getByRole("button", { name: "Approve request", exact: true })
        .click();
      const f = p.getByRole("dialog");
      await f
        .getByLabel("Decision justification")
        .fill(
          "Reviewed original evidence and fixed version through the browser.",
        );
      await f.getByRole("button", { name: "Save", exact: true }).click();
      await expect(f).not.toBeVisible();
      await p.close();
    }
    await jordan.close();
    await expect
      .poll(
        () =>
          d
            .rows<RecoveryExecution>("execution")
            .find((e) => e.id === execution.id)?.state,
      )
      .toBe("Failed");
    expect(
      d
        .rows<RecoveryStep>("step")
        .find((s) => s.executionId === execution.id && s.order === 4)
        ?.evidenceId,
    ).toBe("EV-REC-FAILURE");
    const report = await ok(maya.request, "report.generate", {
      type: "Detailed Incident Report",
      includeLegal: true,
    });
    const artifact = await maya.request.get(`/api/reports/${report.reportId}?organizationId=acme&incidentId=IR-2041`);
    expect(artifact.status()).toBe(200);
    const html = await artifact.text();
    expect(html).toContain("alex: Approve (Security Engineer)");
    expect(html).toContain("maya: Approve (Incident Manager)");
  } finally {
    d.conn.disconnect();
    await maya.close();
    await alex.close();
    await jordan.close();
  }
});

test("edits discovery/classification through the UI while preserving unknown root cause and evidence-linked human classification", async ({
  context,
  page,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  await login(context, "maya");
  await page.goto(base + "/timeline");
  await page
    .getByRole("button", { name: "Generate report", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Edit classification and discovery",
      exact: true,
    })
    .click();
  const f = page.getByRole("dialog", {
    name: "Incident reporting metadata",
    exact: true,
  });
  await f
    .getByLabel("Detection source", { exact: true })
    .fill("Human responder observation");
  await f
    .getByRole("combobox", { name: "Attack vector", exact: true })
    .selectOption("Unknown");
  await f.getByRole("button", { name: "Save", exact: true }).click();
  await expect(f).not.toBeVisible();
  const generated = page.waitForResponse((r) =>
    r.url().endsWith("/api/recovery") && r.request().postDataJSON()?.action === "report.generate",
  );
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  const response = await generated;
  expect(response.status(), await response.text()).toBe(200);
  const { reportId } = await response.json();
  const artifact = await context.request.get(`/api/reports/${reportId}?organizationId=acme&incidentId=IR-2041`);
  expect(artifact.status()).toBe(200);
  const html = await artifact.text();
  expect(html).toContain("Not Yet Established");
  expect(html).toContain("Human responder observation");
  const invalid = await post(context.request, "classification", {
    detectionSource: "Responder",
    initialObservation: "Synthetic observation",
    reportedAt: Date.now() - 1000,
    attackVector: "Unknown",
    actorCategory: "Unknown",
    actionCategory: "Unknown",
    assetCategory: "Server",
    impactCategory: "Unknown",
    rootCause: "",
    lessonsLearned: "",
    evidenceIds: ["EV-018"],
    mitreMappings: [
      {
        techniqueId: "T999999",
        findingId: "IR-2041:F-04",
        evidenceIds: ["EV-018"],
      },
    ],
  });
  expect(invalid.status()).toBe(400);
});

test("does not reuse an approval after an administrator changes and restores the approver role", async ({
  browser,
}) => {
  configure();
  await command("test_restore_memberships", "", {});
  const maya = await browser.newContext(),
    alex = await browser.newContext(),
    jordan = await browser.newContext(),
    sam = await browser.newContext();
  for (const [c, id] of [
    [maya, "maya"],
    [alex, "alex"],
    [jordan, "jordan"],
    [sam, "sam"],
  ] as const)
    await login(c, id);
  const d = await live(maya);
  try {
    await cancelActive(maya, d);
    const started = await start(jordan),
      r = await awaitRequest(d, started.executionId);
    await approve(alex, r);
    for (const role of ["operations", "analyst"]) {
      const changed = await sam.request.post("/api/members/role", {
        headers: { Origin: origin },
        data: { organizationId: "acme", userId: "alex", role },
      });
      expect(changed.status(), await changed.text()).toBe(200);
    }
    expect(
      (
        await post(maya.request, "decide", {
          requestId: r.id,
          revisionToken: r.revisionToken,
          decision: "Approve",
          justification: "Earlier approval must not survive a role change.",
        })
      ).status(),
    ).toBe(400);
    await expect
      .poll(
        () =>
          d
            .rows<RecoveryExecution>("execution")
            .find((e) => e.id === started.executionId)?.state,
      )
      .toBe("Failed");
  } finally {
    await command("test_restore_memberships", "", {});
    d.conn.disconnect();
    await maya.close();
    await alex.close();
    await jordan.close();
    await sam.close();
  }
});

for (const documented of [true, false]) {
  test(`preserves ${documented ? "documented" : "missing"} incident scope narratives in both report formats without graph inventory`, async ({
    context,
    page,
  }) => {
    configure();
    await command("test_restore_memberships", "", {});
    await login(context, "maya");
    const systems = documented
      ? `Billing portal & support API ${randomUUID()}`
      : "";
    const impact = documented
      ? `Synthetic billing interruption <under investigation> ${randomUUID()}`
      : "";
    const response = await context.request.post("/api/incident/create", {
      headers: { Origin: origin },
      data: {
        organizationId: "acme",
        title: "Report narrative regression " + randomUUID(),
        description:
          "Synthetic incident with no graph inventory or assessments yet.",
        type: "Other",
        severity: "High",
        discoveredAt: Date.now(),
        commanderId: "maya",
        responderIds: [],
        systems,
        impact,
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    const { incidentId } = await response.json();
    for (const type of ["Executive Summary", "Detailed Incident Report"]) {
      const preview = await ok<ReportSnapshot>(
        context.request,
        "report.preview",
        {
          incidentId,
          type,
          includeLegal: false,
        },
      );
      const scopeSection = preview.sections.find((s) => s.id === "scope")!;
      const fields = Object.fromEntries(
        scopeSection.fields.map((f) => [f.label, f.value]),
      );
      expect(fields["Reported affected systems"]).toBe(
        systems || "Not yet documented",
      );
      expect(fields["Reported business impact"]).toBe(
        impact || "Not yet documented",
      );
      expect(fields["Graph scope coverage"]).toContain("Not yet established");
      expect(preview.sourceIds.assessments).toEqual([]);
      expect(
        scopeSection.tables.find(
          (t) => t.title === "Evidence-backed assessments",
        )?.rows ?? [],
      ).toEqual([]);
      for (const label of [
        "Reported affected systems",
        "Reported business impact",
      ]) {
        expect(
          preview.completeness.find((c) => c.label === label)?.status,
        ).toBe(documented ? "Documented" : "Missing");
      }
      expect(
        preview.completeness.find((c) => c.label === "Exfiltration scope")
          ?.status,
      ).toBe("Unverified");
      const { reportId } = await ok(context.request, "report.generate", {
        incidentId,
        type,
        includeLegal: false,
      });
      await page.goto(
        `/api/reports/${reportId}?organizationId=acme&incidentId=${incidentId}`,
      );
      await expect(page.getByRole("heading", { level: 1 })).toContainText(type);
      await expect(
        page
          .locator("section")
          .getByText("Reported affected systems", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .locator("section")
          .getByText("Reported business impact", { exact: true }),
      ).toBeVisible();
      if (documented) {
        await expect(
          page.locator("section").getByText(systems, { exact: true }),
        ).toBeVisible();
        await expect(
          page.locator("section").getByText(impact, { exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          page
            .locator("section")
            .getByText("Not yet documented", { exact: true }),
        ).toHaveCount(2);
      }
      await expect(
        page
          .locator("section")
          .getByText(/Not yet established.*no graph inventory/),
      ).toBeVisible();
    }
  });
}
