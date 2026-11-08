import { test, expect } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { command } from "../../lib/server/gateway";
import type { Finding, IncidentEvent, Evidence } from "../../lib/incident-model";
import type { Message, Task, Page as UrgentPage } from "../../lib/coordination";
import type { ScopeSummary, ScopeAssessment, ScopeEntity } from "../../../shared/scope";
import { base, scope, configureGateway, login, post, ok, coord, coordOk, sessionHash,
  connectAnonymous, live, findingData, taskData, upload } from "./critical-helpers";

// Default mode: failures do not skip the remaining independent scenarios.
test.beforeAll(configureGateway);
test.beforeEach(async () => { await command("test_restore_memberships", "", {}); });
test.afterEach(async () => { await command("test_restore_memberships", "", {}); });

test("access boundaries reject impersonation and revoke an existing live session", async ({ browser, context, request }) => {
  expect((await request.get("/api/workspace?organizationId=acme&incidentId=IR-2041")).status()).toBe(401);
  await login(context, "alex");
  for (const query of ["organizationId=northstar&incidentId=IR-2041", "organizationId=acme&incidentId=IR-9999"])
    expect((await context.request.get(`/api/workspace?${query}`)).status()).toBe(403);
  expect((await post(context.request, "members/role", { organizationId: "acme", userId: "alex", role: "administrator" })).status()).toBe(403);
  const anonymous = await connectAnonymous();
  try {
    await expect(anonymous.reducers.accessCommand({ requestId: randomUUID(), sessionHash: "sam", action: "member_role",
      payload: JSON.stringify({ organizationId: "acme", userId: "alex", role: "administrator" }) })).rejects.toThrow();
    expect((await request.post("http://127.0.0.1:3101/v1/database/aegis-e2e/sql", {
      data: "SELECT * FROM users", headers: { "Content-Type": "text/plain" },
    })).ok()).toBe(false);
  } finally { anonymous.disconnect(); }
  const observer = await live(context);
  const admin = await browser.newContext();
  try {
    expect(observer.rows("incident", "incident").length).toBeGreaterThan(0);
    await login(admin, "sam");
    await ok(admin.request, "members/revoke", { organizationId: "acme", userId: "alex" });
    await expect.poll(() => observer.rows("incident", "incident").length).toBe(0);
    await expect.poll(() => [...observer.conn.db.myAccess.iter()].length).toBe(0);
    expect((await context.request.get("/api/workspace?organizationId=acme&incidentId=IR-2041")).status()).toBe(403);
    expect((await post(context.request, "incident/findings", { ...scope, ...findingData("Revoked write") })).status()).toBe(403);
  } finally { observer.conn.disconnect(); await admin.close(); }
});

test("incident documentation preserves original evidence and append-only corrections", async ({ context, request }) => {
  await login(context, "maya");
  const observer = await live(context);
  try {
    const created = await ok(context.request, "incident/create", { organizationId: "acme", title: `Critical incident ${randomUUID()}`,
      description: "Initial synthetic report for a minimal integration check.", severity: "High", type: "Ransomware",
      discoveredAt: Date.now(), commanderId: "maya", responderIds: ["alex"] });
    const incidentId = created.incidentId;
    const payload = { organizationId: "acme", incidentId, ...findingData(`Observed traffic ${randomUUID()}`) };
    const { findingId } = await ok(context.request, "incident/findings", payload);
    const bytes = Buffer.from("Synthetic observation; traffic recorded, cause unknown.\n");
    const evidenceId = await upload(context.request, incidentId, bytes, findingId);
    const original = await context.request.get(`/api/evidence/${evidenceId}`);
    expect(original.status()).toBe(200);
    expect(await original.body()).toEqual(bytes);
    expect((await request.get(`/api/evidence/${evidenceId}`)).ok()).toBe(false);
    await expect.poll(() => observer.rows<Evidence>("incident", "evidence", incidentId).find((e) => e.id === evidenceId)?.sha256)
      .toBe(createHash("sha256").update(bytes).digest("hex"));
    await expect.poll(() => observer.rows<IncidentEvent>("incident", "event", incidentId).some((e) => e.findingId === findingId)).toBe(true);
    const initialEvent = observer.rows<IncidentEvent>("incident", "event", incidentId).find((e) => e.findingId === findingId && e.previousValue === "")!;
    expect(initialEvent).toBeDefined();
    expect((await post(context.request, "incident/findings/update", { ...payload, findingId, status: "Confirmed", reason: "No supporting evidence supplied." })).status()).toBe(400);
    await ok(context.request, "incident/findings/update", { ...payload, findingId, status: "Confirmed", evidenceIds: [evidenceId], reason: "Human reviewer verified only the recorded traffic observation." });
    await ok(context.request, "incident/note", { organizationId: "acme", incidentId, type: "correction", title: "Clarify observation",
      description: "Traffic is verified; containment and root cause are not established.", findingId, correctsEventId: initialEvent.id, evidenceIds: [evidenceId] });
    await expect.poll(() => observer.rows<Finding>("incident", "finding", incidentId).find((f) => f.id === findingId)?.verifiedBy).toBe("maya");
    await expect.poll(() => observer.rows<IncidentEvent>("incident", "event", incidentId).some((e) => e.correctsEventId === initialEvent.id)).toBe(true);
    expect(observer.rows<IncidentEvent>("incident", "event", incidentId).find((e) => e.id === initialEvent.id)).toEqual(initialEvent);
  } finally { observer.conn.disconnect(); }
});

test("scope confirms one record impact without promoting other dimensions or inventory", async ({ context, browser }) => {
  await login(context, "alex");
  const observer = await live(context);
  const operations = await browser.newContext();
  try {
    const query = new URLSearchParams({ ...scope, operation: "records", groupId: "acme:scope:RG-OCTOBER", query: "C-2240", limit: "1" });
    const response = await context.request.get(`/api/scope?${query}`);
    expect(response.status()).toBe(200);
    const records = (await response.json()).records as ScopeEntity[];
    expect(records).toHaveLength(1);
    const entityId = records[0].id;
    const before = observer.rows<ScopeSummary>("scope", "summary")[0];
    expect(before).toBeDefined();
    const evidenceId = await upload(context.request, scope.incidentId, Buffer.from("SYNTHETIC: record=C-2240 encryption observed; exfiltration unverified.\n"));
    const assessment = { ...scope, action: "assessment", entityId, dimension: "Encryption", status: "Confirmed",
      description: "Independent synthetic check of this record only.", justification: "Human reviewed the record-specific verification artifact.", evidenceIds: [evidenceId] };
    await login(operations, "jordan");
    expect((await post(operations.request, "scope", assessment)).status()).toBe(403);
    await ok(context.request, "scope", { ...assessment, dimension: "Exfiltration", status: "Suspected" });
    await ok(context.request, "scope", assessment);
    await expect.poll(() => observer.rows<ScopeSummary>("scope", "summary")[0]?.individuallyConfirmedRecords).toBe(before.individuallyConfirmedRecords + 1);
    expect(observer.rows<ScopeSummary>("scope", "summary")[0].totalRecords).toBe(before.totalRecords);
    const assessments = observer.rows<ScopeAssessment>("scope", "assessment").filter((a) => a.entityId === entityId);
    expect(assessments.find((a) => a.dimension === "Encryption")).toMatchObject({ status: "Confirmed", verifiedBy: "alex" });
    expect(assessments.find((a) => a.dimension === "Exfiltration")?.status).toBe("Suspected");
  } finally { observer.conn.disconnect(); await operations.close(); }
});

test("messages synchronize once and private DM-derived findings stay restricted", async ({ context, browser }) => {
  await login(context, "maya");
  const analyst = await browser.newContext(), legal = await browser.newContext();
  await login(analyst, "alex"); await login(legal, "priya");
  const participant = await live(analyst), outsider = await live(legal);
  try {
    const operationId = randomUUID(), content = `Synthetic safe text <script>untrusted</script>\n${operationId}`;
    const data = { conversationId: "acme:IR-2041:room", content, references: [] };
    const sent = await coordOk(context.request, "message.send", data, operationId);
    expect(await coordOk(context.request, "message.send", data, operationId)).toEqual(sent);
    await expect.poll(() => participant.rows<Message>("coordination", "message").filter((m) => m.id === sent.messageId).length).toBe(1);
    expect(participant.rows<Message>("coordination", "message").find((m) => m.id === sent.messageId)?.content).toBe(content);
    const dm = await coordOk(context.request, "dm.create", { userId: "alex" });
    const privateMessage = await coordOk(context.request, "message.send", { conversationId: dm.conversationId, content: `Private observation ${randomUUID()}`, references: [] });
    const finding = await coordOk(context.request, "finding.create", { ...findingData(`Private finding ${randomUUID()}`), sourceMessageId: privateMessage.messageId, references: [] });
    await expect.poll(() => participant.rows<Finding>("incident", "finding").some((f) => f.id === finding.findingId)).toBe(true);
    // A later shared message is a subscription barrier: the outsider has caught up to the private write.
    const barrier = await coordOk(context.request, "message.send", { ...data, content: `Public synchronization barrier ${randomUUID()}` });
    await expect.poll(() => outsider.rows<Message>("coordination", "message").some((m) => m.id === barrier.messageId)).toBe(true);
    expect(outsider.rows<Message>("coordination", "message").some((m) => m.id === privateMessage.messageId)).toBe(false);
    expect(outsider.rows<Finding>("incident", "finding").some((f) => f.id === finding.findingId)).toBe(false);
    expect(outsider.rows<IncidentEvent>("incident", "event").some((e) => e.findingId === finding.findingId)).toBe(false);
    expect((await coord(context.request, "message.send", { ...data, content: "Rejected private reference", references: [{ kind: "finding", id: finding.findingId }] })).status()).toBe(403);
  } finally { participant.conn.disconnect(); outsider.conn.disconnect(); await analyst.close(); await legal.close(); }
});

test("investigation tasks require independent evidence-backed review without resolving findings", async ({ context, browser }) => {
  await login(context, "maya");
  const analyst = await browser.newContext(); await login(analyst, "alex");
  const observer = await live(context);
  try {
    const before = observer.rows<Finding>("incident", "finding").find((f) => f.id === "IR-2041:F-04");
    expect(before).toBeDefined();
    const task = await coordOk(context.request, "task.create", taskData(`Review task ${randomUUID()}`));
    for (const status of ["In Progress", "Awaiting Verification"])
      await coordOk(analyst.request, "task.update", { taskId: task.taskId, status, comment: "Investigation work documented for independent review." });
    const completion = { taskId: task.taskId, status: "Completed", comment: "Independent human verification documented." };
    expect((await coord(analyst.request, "task.update", completion)).status()).toBe(403);
    expect((await coord(context.request, "task.update", completion)).status()).toBe(400);
    await coordOk(context.request, "task.update", { ...completion, references: [{ kind: "evidence", id: "EV-018" }] });
    await expect.poll(() => observer.rows<Task>("coordination", "task").find((t) => t.id === task.taskId)?.status).toBe("Completed");
    expect(observer.rows<Task>("coordination", "task").find((t) => t.id === task.taskId)?.verifiedBy).toBe("maya");
    expect(observer.rows<Finding>("incident", "finding").find((f) => f.id === before!.id)?.status).toBe(before!.status);
  } finally { observer.conn.disconnect(); await analyst.close(); }
});

test("server paging escalates once after requester closes and acknowledgment leaves work open", async ({ browser }) => {
  const requester = await browser.newContext(), recipient = await browser.newContext();
  await login(requester, "maya"); await login(recipient, "alex");
  const observer = await live(recipient);
  try {
    const task = await coordOk(requester.request, "task.create", { ...taskData(`Urgent task ${randomUUID()}`), references: [{ kind: "evidence", id: "EV-018" }] });
    const page = await coordOk(requester.request, "page.create", { taskId: task.taskId });
    const hash = await sessionHash(requester);
    await requester.close();
    await command("coord.test.page_due", hash, { ...scope, pageId: page.pageId, clientRequestId: randomUUID() });
    await expect.poll(() => observer.rows<UrgentPage>("coordination", "page").find((p) => p.id === page.pageId)?.status).toBe("Escalated");
    await expect.poll(() => observer.rows<UrgentPage>("coordination", "page").filter((p) => p.parentPageId === page.pageId).length).toBe(1);
    const child = observer.rows<UrgentPage>("coordination", "page").find((p) => p.parentPageId === page.pageId)!;
    expect(child.pagedUserId).toBe("maya");
    await expect.poll(() => Number(observer.rows<{ now: string }>("coordination", "policy")[0]?.now)).toBeGreaterThan(Number(child.createdAt) + 2100);
    expect(observer.rows<UrgentPage>("coordination", "page").filter((p) => p.parentPageId === page.pageId)).toHaveLength(1);
    const backup = await browser.newContext();
    try {
      await login(backup, "maya");
      await coordOk(backup.request, "page.acknowledge", { pageId: child.id });
      await expect.poll(() => observer.rows<UrgentPage>("coordination", "page").find((p) => p.id === child.id)?.status).toBe("Acknowledged");
      expect(observer.rows<Task>("coordination", "task").find((t) => t.id === task.taskId)?.status).toBe("Open");
    } finally { await backup.close(); }
  } finally { observer.conn.disconnect(); await requester.close(); await recipient.close(); }
});

test("desktop demo opens all five live pages and essential controls", async ({ context, page }) => {
  await login(context, "maya");
  const title = `Attention handoff ${randomUUID()}`;
  const created = await ok(context.request, "incident/findings", { ...scope, ...findingData(title) });
  await page.goto(`${base}/overview`);
  const attention = page.getByTestId("needs-attention");
  await attention.getByTestId(`finding-${created.findingId}`).click();
  const detail = page.getByRole("dialog", { name: title, exact: true });
  await expect(detail.getByRole("button")).toHaveCount(2); // Create task + close.
  await detail.getByRole("button", { name: "Create task", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Create task", exact: true });
  await form.getByRole("combobox", { name: "Assignee", exact: true }).selectOption("alex");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(attention.getByTestId(`finding-${created.findingId}`)).toHaveCount(0);
  await page.reload();
  await expect(attention).toBeVisible();
  await expect(attention.getByTestId(`finding-${created.findingId}`)).toHaveCount(0);
  await page.locator("summary").filter({ hasText: "View all work" }).click();
  const work = page.getByTestId("all-work");
  await expect(work.getByRole("button", { name: `Investigate: ${title}`, exact: true })).toBeVisible();
  await expect(work.getByTestId(`finding-${created.findingId}`)).toContainText("Suspected");
  const navigation = page.getByRole("navigation", { name: "Incident navigation" });
  await expect(page.getByRole("heading", { name: "Ransomware response", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add finding", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("Finding title")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const [section, heading] of [["Scope", "Scope & evidence"], ["Operations", "Operations"], ["Team", "Team"], ["Timeline", "Timeline"]]) {
    await navigation.getByRole("link", { name: section, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    if (section === "Operations") {
      const requests = page.getByRole("heading", { name: "Requests", exact: true }).locator("..");
      await expect(requests.getByRole("button", { name: /Recovery hardware/ })).toContainText("Pending");
      await expect(requests.getByRole("button", { name: /Temporary support access/ })).toContainText("Rejected");
      await expect(requests.getByRole("button", { name: /Backup storage extension/ })).toContainText("Recorded");
      await page.getByRole("button", { name: "New request", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText("Restore Customer Support Capability");
      await page.getByRole("button", { name: "Close", exact: true }).click();
    }
    if (section === "Team") await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEnabled();
    if (section === "Timeline") {
      const events = page.getByTestId("timeline-events");
      await expect(events.getByRole("button").filter({ hasText: "Conflicting isolation reports" }).locator(".bg-red-400")).toBeVisible();
      await expect(events.getByRole("button").filter({ hasText: "Independent purchasing route documented" }).locator(".bg-emerald-400")).toBeVisible();
      await expect(events.getByRole("button").filter({ hasText: "Vendor approval depends on affected SSO" }).locator(".bg-amber-400")).toBeVisible();
    }
  }
});
