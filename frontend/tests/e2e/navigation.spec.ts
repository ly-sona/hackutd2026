import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = "/org/acme/incidents/IR-2041";

test("switches incident pages without requests, rebinding or access-screen flashes", async ({ page, context }) => {
  const accounts = JSON.parse(readFileSync(
    resolve(process.cwd(), "../.spacetime/e2e/demo-accounts.json"), "utf8",
  )) as { id: string; login: string; password: string }[];
  const account = accounts.find((item) => item.id === "sam")!;
  const login = await context.request.post("/api/auth/login", {
    data: { login: account.login, password: account.password },
    headers: { Origin: "http://127.0.0.1:3100" },
  });
  expect(login.status()).toBe(200);
  let binds = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/connection/bind")) binds++;
  });
  await page.goto(`${base}/overview`);
  await expect(page.getByRole("heading", { name: "Ransomware response", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Incident navigation" });
  const header = await navigation.elementHandle();
  const initialBinds = binds;
  const routeRequests: string[] = [];
  await page.route("**/*", async (route) => {
    if (route.request().isNavigationRequest() || route.request().headers().rsc) {
      routeRequests.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.evaluate(() => {
    document.body.dataset.accessFlashed = "false";
    new MutationObserver(() => {
      if (document.body.textContent?.includes("Verifying workspace access"))
        document.body.dataset.accessFlashed = "true";
    }).observe(document.body, { childList: true, subtree: true });
  });
  for (const [section, title] of [
    ["scope", "Scope & evidence"], ["operations", "Operations"], ["team", "Team"],
    ["timeline", "Timeline"], ["overview", "Ransomware response"],
  ]) {
    await navigation.getByRole("link", { name: new RegExp(`^${section}$`, "i") }).click();
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible({ timeout: 1500 });
    await expect(page).toHaveURL(`${base}/${section}`);
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
  }
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Ransomware response", exact: true })).toBeVisible();
  expect(binds).toBe(initialBinds);
  expect(routeRequests).toEqual([]);
  await expect(page.locator("body")).toHaveAttribute("data-access-flashed", "false");
  // A hard reload still resolves the URL and performs fresh authorization.
  await page.unrouteAll({ behavior: "wait" });
  await page.goto(`${base}/timeline`);
  await expect(page.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();
});
