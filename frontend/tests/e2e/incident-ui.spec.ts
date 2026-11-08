import { openGraphTools } from "./presentation-helpers";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "/org/acme/incidents/IR-2041";

test("shows the demo priority mix, business continuity states and colored event examples", async ({
  page,
}) => {
  await page.goto(`${base}/overview`);
  const rows = page.locator('[data-testid^="finding-"]:visible');
  await expect(rows).toHaveCount(3);
  for (const [index, color] of [
    "rgb(255, 83, 91)",
    "rgb(255, 205, 56)",
    "rgb(69, 225, 118)",
  ].entries()) {
    await expect(rows.nth(index).locator("span[aria-label]").first()).toHaveCSS(
      "background-color",
      color,
    );
  }
  await expect(
    page.getByRole("row").filter({ hasText: "Customer Support" }),
  ).toContainText("Restricted");
  await expect(
    page.getByRole("row").filter({ hasText: "Vendor Purchasing" }),
  ).toContainText("Fallback available");
  await page.goto(`${base}/scope`);
  const account = page.getByTestId("scope-node-A-09");
  await expect(account).toContainText("Compromised:");
  await expect(account.locator("p").last()).not.toHaveCSS(
    "color",
    "rgb(255, 205, 56)",
  );
  await page.goto(`${base}/timeline`);
  await page.getByLabel("Filter timeline events").selectOption("Decisions");
  const decision = page
    .getByTestId("timeline-events")
    .getByRole("button")
    .filter({ hasText: "Independent purchasing route documented" });
  await expect(decision.locator(".bg-emerald-400")).toBeVisible();
  await decision.click();
  await expect(page.getByTestId("event-detail")).toContainText(
    "No purchase has been approved or executed",
  );
});

test.beforeEach(async ({ context }) => {
  const accounts = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../.spacetime/e2e/demo-accounts.json"),
      "utf8",
    ),
  ) as { id: string; login: string; password: string }[];
  const account = accounts.find((item) => item.id === "maya")!;
  const response = await context.request.post("/api/auth/login", {
    data: { login: account.login, password: account.password },
    headers: { Origin: "http://127.0.0.1:3100" },
  });
  expect(response.status()).toBe(200);
});

test("retains visual styling without disabling live Phase 2 actions", async ({
  page,
}) => {
  await page.goto(`${base}/overview`);
  const addFinding = page.getByRole("button", {
    name: "Add finding",
    exact: true,
  });
  await expect(addFinding).toBeEnabled();
  await expect(addFinding).toHaveCSS("opacity", "1");
  await expect(page.getByText("Critical", { exact: true }).first()).toHaveCSS(
    "color",
    "rgb(255, 83, 91)",
  );
  await page.goto(`${base}/timeline`);
  const events = page.getByTestId("timeline-events").getByRole("button");
  await expect(events.first()).toBeVisible();
  for (const event of [events.first(), events.last()]) {
    const title = await event
      .locator("[data-event-title]")
      .getAttribute("data-event-title");
    expect(title).toBeTruthy();
    await event.click();
    await expect(
      page
        .getByTestId("event-detail")
        .getByRole("heading", { name: title!, exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Filter timeline events").selectOption("Decisions");
  const types = await page
    .getByTestId("timeline-events")
    .locator("[data-event-type]")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-event-type")),
    );
  expect(types.every((type) => type === "decision")).toBe(true);
  await page.getByLabel("Since my last visit").check();
  await expect(page.getByLabel("Since my last visit")).toBeChecked();
  await page.goto(`${base}/operations`);
  const approve = page.getByRole("button", {
    name: "Approve request",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await expect(approve).toHaveCSS("opacity", "1");
  await expect(approve).toHaveCSS("background-color", "rgb(250, 250, 250)");
});

test("keeps request, entity and conversation selection independent", async ({
  page,
}) => {
  await page.goto(`${base}/operations`);
  await page.getByRole("button", { name: /Backup storage extension/ }).click();
  const request = page.locator("main section");
  await expect(request.getByText("Approved", { exact: true })).toHaveCount(2);
  await expect(request.getByText("Pending", { exact: true })).toHaveCount(0);
  await page.goto(`${base}/scope`);
  await openGraphTools(page);
  await page.getByLabel("Find scope entity").selectOption("acme:scope:A-09");
  const entity = page.getByTestId("scope-detail");
  await expect(entity.getByRole("heading", { level: 2 })).toHaveText(
    "Administrator A-09",
  );
  await openGraphTools(page);
  await page.getByLabel("Find scope entity").selectOption("evidence:EV-018");
  await expect(entity.getByRole("heading", { level: 2 })).toHaveText(
    "EV-018-network.log",
  );
  await page.goto(`${base}/team`);
  await page
    .getByRole("button", { name: "Message Alex Rivera", exact: true })
    .click();
  const conversation = page.getByRole("region", {
    name: "Selected conversation",
  });
  await expect(
    conversation.getByRole("heading", { name: "Alex Rivera", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /IR-2041 · Response team/ }).click();
  await expect(
    conversation.getByRole("heading", {
      name: "IR-2041 · Response team",
      exact: true,
    }),
  ).toBeVisible();
});

test("keeps all five pages within a phone viewport and puts chat before the directory", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of [
    "overview",
    "scope",
    "operations",
    "team",
    "timeline",
  ]) {
    await page.goto(`${base}/${section}`);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  await page.goto(`${base}/team`);
  const title = page
    .getByRole("region", { name: "Selected conversation" })
    .getByRole("heading");
  await expect(title).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conversations", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("complementary", {
      name: "Conversation directory",
      includeHidden: true,
    }),
  ).toBeHidden();
  await page.goto(`${base}/scope`);
  await openGraphTools(page);
  await expect(page.getByLabel("Find scope entity")).toBeVisible();
});

test("keeps the compact overview and its advanced documentation tools accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`${base}/overview`);
  await expect(
    page.getByRole("heading", { name: "Affected operations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add finding", exact: true }),
  ).toHaveCSS("background-color", "rgb(250, 250, 250)");
  expect(
    await page.locator('[data-testid^="finding-"]:visible').count(),
  ).toBeLessThanOrEqual(3);
  const details = page.getByRole("button", {
    name: "Incident details and actions",
    exact: true,
  });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await details.click();
  for (const name of [
    "Update incident",
    "Document update",
    "Attach evidence",
    "New incident",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeEnabled();
  }
  await page
    .getByRole("button", { name: "Attach evidence", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Attach evidence", exact: true }),
  ).toBeVisible();
});

test("opens the live task workspace from the streamlined chat header", async ({
  page,
}) => {
  await page.goto(`${base}/team`);
  await page
    .getByRole("button", { name: "Incident tasks", exact: true })
    .click();
  const tasks = page.getByRole("dialog");
  await expect(
    tasks.getByRole("heading", { name: "Incident tasks", exact: true }).first(),
  ).toBeVisible();
  await expect(
    tasks.getByRole("button", { name: "Create task", exact: true }),
  ).toBeEnabled();
  await tasks.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("dialog").last().getByLabel("Task title", { exact: true }),
  ).toBeVisible();
});
