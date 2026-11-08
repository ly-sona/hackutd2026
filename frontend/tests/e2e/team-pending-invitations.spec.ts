import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

test("Team pending invitations share page details and actions and update their live count", async ({
  page,
  context,
}) => {
  const accounts = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../.spacetime/e2e/demo-accounts.json"),
      "utf8",
    ),
  ) as { id: string; login: string; password: string }[];
  const account = accounts.find((account) => account.id === "sam")!;
  const origin = "http://127.0.0.1:3100";
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    (
      await context.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { login: account.login, password: account.password },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/org/acme/incidents/IR-2041/team");
  await expect(
    page.getByRole("button", { name: "Members", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "CONVERSATION OVERSIGHT", exact: true }),
  ).toHaveCount(0);
  const summary = page
    .locator("summary")
    .filter({ hasText: /^Invitations pending \(\d+\)$/ });
  await expect(summary).toBeVisible();
  const initial = Number((await summary.innerText()).match(/\((\d+)\)/)![1]);
  const phone =
    "+1555" +
    randomBytes(4).readUInt32BE().toString().padStart(7, "0").slice(-7);
  const created = await context.request.post("/api/invitations", {
    headers: { Origin: origin },
    data: {
      organizationId: "acme",
      incidentId: "IR-2041",
      role: "analyst",
      phone,
      contactVerified: true,
    },
  });
  expect(created.status()).toBe(201);
  await expect(summary).toContainText(`(${initial + 1})`);
  await summary.click();
  const invite = page
    .getByTestId("pending-invitation")
    .filter({ hasText: phone });
  await expect(invite).toContainText("Security Analyst");
  await expect(invite).toContainText("IR-2041");
  await expect(invite).toContainText("pending");
  const expiry = await invite.getByTestId("invitation-expiry").innerText();
  const management = await context.newPage();
  await management.goto("/org/acme/invitations");
  const pageRow = management.getByRole("row").filter({ hasText: phone });
  await expect(pageRow).toContainText(expiry);
  await expect(pageRow).toContainText("Security Analyst");
  await invite.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("pending-desktop.png"),
  });
  await invite
    .getByRole("button", { name: "Generate replacement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm replacement", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Replacement invitation created",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(summary).toContainText(`(${initial + 1})`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await invite.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("pending-mobile.png") });
  await invite.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm invitation revocation", exact: true })
    .click();
  await expect(summary).toContainText(`(${initial})`);
  await expect(invite).toHaveCount(0);
  await expect(
    management
      .getByRole("row")
      .filter({ hasText: phone })
      .filter({ hasText: "pending" }),
  ).toHaveCount(0);
  await expect(summary).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await management.close();
});
