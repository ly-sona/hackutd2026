import { test, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
const origin = process.env.AEGIS_TEST_APP_URL ?? "http://127.0.0.1:3100",
  base = "/org/acme/incidents/IR-2041";
async function login(context: BrowserContext, id: string) {
  const accounts = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "..", process.env.AEGIS_TEST_DATA_DIR ?? ".spacetime/e2e", "demo-accounts.json"),
      "utf8",
    ),
  ) as { id: string; login: string; password: string }[];
  const account = accounts.find((account) => account.id === id)!;
  expect(
    (
      await context.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { login: account.login, password: account.password },
      })
    ).status(),
  ).toBe(200);
}
test("administrator can coordinate, inspect records and edit scope while tenant boundaries remain enforced", async ({
  page,
  context,
}) => {
  await login(context, "sam");
  await page.goto(`${base}/team`);
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeEnabled();
  const message = "Administrator coordination " + randomUUID();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(message);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.locator("[data-message-id]").filter({ hasText: message }),
  ).toContainText("Sam Patel");
  await expect(
    page.getByRole("button", { name: "Invite responder", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Incident tasks", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Create task", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  const record = await context.request.get(
    "/api/scope?organizationId=acme&incidentId=IR-2041&operation=entity&entityId=acme%3Arecord%3AC-1044",
  );
  expect(record.status()).toBe(200);
  const asset = await context.request.post("/api/scope", {
    headers: { Origin: origin },
    data: {
      action: "asset.create",
      organizationId: "acme",
      incidentId: "IR-2041",
      reference: "ADMIN-" + randomUUID(),
      name: "Administrator-created server",
      assetType: "Server",
      owner: "Sam Patel",
      description: "Synthetic administrator access verification.",
      status: "Unassessed",
      justification: "Verify administrator scope editing.",
      evidenceIds: [],
    },
  });
  expect(asset.status()).toBe(200);
  expect((await context.request.get("/api/evidence/EV-018")).status()).toBe(
    200,
  );
  expect(
    (
      await context.request.get(
        "/api/workspace?organizationId=northstar&incidentId=IR-2041",
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.get(
        "/api/workspace?organizationId=acme&incidentId=IR-9999",
      )
    ).status(),
  ).toBe(403);
});
test("administrator can open incidents without explicit assignment and review DMs without joining or impersonating participants", async ({
  browser,
  page,
  context,
}) => {
  await login(context, "sam");
  const commander = await browser.newContext();
  try {
    await login(commander, "maya");
    const created = await commander.request.post("/api/incident/create", {
      headers: { Origin: origin },
      data: {
        organizationId: "acme",
        title: "Administrator organization-wide access " + randomUUID(),
        description: "Incident explicitly assigned to Maya and Alex, not Sam.",
        type: "Other",
        severity: "High",
        discoveredAt: Date.now(),
        commanderId: "maya",
        systems: "",
        impact: "",
        responderIds: ["alex"],
      },
    });
    expect(created.status()).toBe(200);
    const { incidentId } = await created.json();
    expect(
      (
        await context.request.get(
          `/api/workspace?organizationId=acme&incidentId=${incidentId}&permission=scope:verify`,
        )
      ).status(),
    ).toBe(200);
    await page.goto(`/org/acme/incidents/${incidentId}/team`);
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Message Alex Rivera", exact: true }),
    ).toBeVisible();
    const dm = await commander.request.post("/api/coordination", {
      headers: { Origin: origin },
      data: {
        action: "dm.create",
        organizationId: "acme",
        incidentId: "IR-2041",
        clientRequestId: randomUUID(),
        userId: "alex",
      },
    });
    expect(dm.status()).toBe(200);
    const { conversationId } = await dm.json();
    await page.goto(
      `${base}/team?conversation=${encodeURIComponent(conversationId)}`,
    );
    await expect(
      page.getByText("Read-only administrator review", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeDisabled();
    const denied = await context.request.post("/api/coordination", {
      headers: { Origin: origin },
      data: {
        action: "message.send",
        organizationId: "acme",
        incidentId: "IR-2041",
        clientRequestId: randomUUID(),
        conversationId,
        content: "Not a participant",
        references: [],
      },
    });
    expect(denied.status()).toBe(403);
    await page
      .getByRole("button", { name: "Message Alex Rivera", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeEnabled();
  } finally {
    await commander.close();
  }
});

test("removing administrator authority immediately removes oversight of other participants' DMs", async ({ browser, context }) => {
  await login(context, "sam");
  const analyst = await browser.newContext();
  const changeRole = (role: string) => context.request.post("/api/members/role", { headers: { Origin: origin }, data: { organizationId: "acme", userId: "alex", role } });
  try {
    expect((await changeRole("administrator")).status()).toBe(200);
    await login(analyst, "alex");
    const page = await analyst.newPage();
    const conversationId = "acme:IR-2041:dm:maya:priya";
    await page.goto(`${base}/team?conversation=${encodeURIComponent(conversationId)}`);
    await expect(page.getByRole("region", { name: "Selected conversation" }).getByRole("heading", { name: "Maya Chen, Priya Shah", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeDisabled();
    expect((await changeRole("analyst")).status()).toBe(200);
    await expect(page.getByRole("region", { name: "Selected conversation" }).getByRole("heading", { name: "IR-2041 · Response team", exact: true })).toBeVisible();
    const denied = await analyst.request.post("/api/coordination", { headers: { Origin: origin }, data: { organizationId: "acme", incidentId: "IR-2041", action: "message.read", clientRequestId: randomUUID(), conversationId, messageId: "1" } });
    expect(denied.status()).toBe(404);
  } finally { await changeRole("analyst"); await analyst.close(); }
});
