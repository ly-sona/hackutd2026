import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type APIRequestContext,
  type WebSocketRoute,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { command, withGateway } from "../../lib/server/gateway";
import { tokenHash } from "../../lib/server/password";
import { DbConnection } from "../../src/module_bindings";
const origin = "http://127.0.0.1:3100";
const base = "/org/acme/incidents/IR-2041";
function account(id: string) {
  const accounts = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../.spacetime/e2e/demo-accounts.json"),
      "utf8",
    ),
  ) as { id: string; login: string; password: string }[];
  return accounts.find((a) => a.id === id)!;
}
function configureTestGateway() {
  const credential = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "../.spacetime/e2e/gateway.json"),
      "utf8",
    ),
  ) as { token: string };
  process.env.SPACETIMEDB_SERVER_TOKEN = credential.token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
}
async function post(request: APIRequestContext, path: string, data: object) {
  return request.post(`/api/${path}`, { data, headers: { Origin: origin } });
}
async function login(context: BrowserContext, id: string) {
  const a = account(id);
  const response = await post(context.request, "auth/login", {
    login: a.login,
    password: a.password,
  });
  expect(response.status()).toBe(200);
}
async function openWorkspace(page: Page, section = "team") {
  await page.goto(`${base}/${section}`);
  await expect(
    page.getByRole("navigation", { name: "Incident navigation" }),
  ).toBeVisible();
}
async function invite(request: APIRequestContext, userId = "taylor") {
  const response = await post(request, "invitations", {
    organizationId: "acme",
    incidentId: "IR-2041",
    role: "analyst",
    userId,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as {
    id: string;
    link: string;
    expiresAt: string;
  };
}
const secretOf = (link: string) => new URL(link).pathname.split("/").at(-1)!;

test.describe("independent access controls against real SpacetimeDB", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    configureTestGateway();
    await command("test_restore_memberships", "", {});
  });
  test.afterAll(async () => {
    await command("test_restore_memberships", "", {});
  });

  test("requires an independent account, rejects corporate identity and spoofed sessions, then supports login and logout", async ({
    page,
    context,
  }) => {
    await page.goto(`${base}/overview`);
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page
      .getByLabel("AEGIS account", { exact: true })
      .fill("corporate-admin@acme.example");
    await page
      .getByLabel("Password", { exact: true })
      .fill(randomBytes(16).toString("hex"));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "Sign-in failed",
    );
    const spoof = await context.request.get("/api/session", {
      headers: { Cookie: "aegis_session=sam" },
    });
    expect(spoof.status()).toBe(401);
    const sam = account("sam");
    await page.getByLabel("AEGIS account", { exact: true }).fill(sam.login);
    await page.getByLabel("Password", { exact: true }).fill(sam.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ransomware response", exact: true }),
    ).toBeVisible();
    const cookie = (await context.cookies()).find(
      (c) => c.name === "aegis_session",
    )!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          /auth|token|session/i.test(key),
        ),
      ),
    ).toBe(false);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get("/api/session")).status()).toBe(401);
  });

  test("renders all five pages, preserves navigation and exposes authorized recovery actions", async ({
    page,
    context,
  }) => {
    await login(context, "sam");
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    for (const [section, heading] of [
      ["overview", "Ransomware response"],
      ["scope", "Scope & evidence"],
      ["operations", "Operations"],
      ["team", "Team"],
      ["timeline", "Timeline"],
    ]) {
      await openWorkspace(page, section);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Incident navigation" })
          .getByRole("link"),
      ).toHaveCount(5);
    }
    await openWorkspace(page, "operations");
    await expect(
      page.getByRole("button", { name: "New request", exact: true }),
    ).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkspace(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test("reconnects a protected workspace and preserves authorization through client navigation", async ({
    page,
    context,
  }) => {
    await login(context, "sam");
    let socket: WebSocketRoute | undefined;
    await page.routeWebSocket(/\/v1\/database\//, (route) => {
      route.connectToServer();
      socket = route;
    });
    await openWorkspace(page);
    await socket!.close({
      code: 1012,
      reason: "Testing protected connection recovery",
    });
    await expect(
      page.getByRole("navigation", { name: "Incident navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Incident navigation" }),
    ).toBeVisible();
    for (const section of ["Overview", "Team", "Scope", "Timeline", "Team"]) {
      await page
        .getByRole("navigation", { name: "Incident navigation" })
        .getByRole("link", { name: section, exact: true })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Incident navigation" }),
      ).toBeVisible();
      await expect(page.getByTestId("access-summary")).toContainText(
        "Administrator",
      );
    }
  });

  test("denies direct administration, tampered claims, cross-organization and unassigned-incident access", async ({
    context,
    browser,
  }) => {
    await login(context, "alex");
    expect(
      (
        await post(context.request, "invitations", {
          organizationId: "acme",
          incidentId: "IR-2041",
          role: "administrator",
          userId: "taylor",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(context.request, "members/role", {
          organizationId: "acme",
          userId: "alex",
          role: "administrator",
          actorUserId: "sam",
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await context.request.get(
          "/api/workspace?organizationId=northstar&incidentId=IR-2041",
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(context.request, "members/role", {
          organizationId: "northstar",
          userId: "alex",
          role: "administrator",
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-9999",
        )
      ).status(),
    ).toBe(403);
    const legal = await browser.newContext();
    await login(legal, "priya");
    expect(
      (
        await post(legal.request, "members/role", {
          organizationId: "acme",
          userId: "sam",
          role: "legal",
        })
      ).status(),
    ).toBe(403);
    await command("test_remove_incident", "", { userId: "priya" });
    expect(
      (
        await legal.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041",
        )
      ).status(),
    ).toBe(403);
    await legal.close();
    await command("test_restore_memberships", "", {});
    expect(
      (
        await context.request.post("/api/members/revoke", {
          data: { organizationId: "acme", userId: "sam" },
          headers: { Origin: "https://untrusted.example" },
        })
      ).status(),
    ).toBe(403);
  });

  test("blocks anonymous database reads and direct reducer impersonation", async ({
    request,
  }) => {
    const privateRead = await request.post(
      "http://127.0.0.1:3101/v1/database/aegis-e2e/sql",
      {
        data: "SELECT * FROM users",
        headers: { "Content-Type": "text/plain" },
      },
    );
    expect(privateRead.ok()).toBe(false);
    const conn = await new Promise<DbConnection>((resolve, reject) => {
      DbConnection.builder()
        .withUri("http://127.0.0.1:3101")
        .withDatabaseName("aegis-e2e")
        .onConnect(resolve)
        .onConnectError((_ctx, error) => reject(error))
        .build();
    });
    try {
      await expect(
        conn.reducers.accessCommand({
          requestId: crypto.randomUUID(),
          sessionHash: "sam",
          action: "member_role",
          payload: JSON.stringify({
            organizationId: "acme",
            userId: "alex",
            role: "administrator",
          }),
        }),
      ).rejects.toThrow();
      await expect(
        conn.procedures.lookupCredentials({ login: "sam.patel" }),
      ).rejects.toContain("Trusted server required");
      await new Promise<void>((resolve, reject) =>
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve())
          .onError(() => reject(new Error("Subscription failed")))
          .subscribe("SELECT * FROM my_access"),
      );
      expect([...conn.db.myAccess.iter()]).toHaveLength(0);
    } finally {
      conn.disconnect();
    }
    await expect(
      withGateway(async (conn) =>
        conn.procedures.takeCommandResult({ requestId: crypto.randomUUID() }),
      ),
    ).resolves.toContain("UNAVAILABLE");
  });

  test("creates an admin invitation in the UI, accepts it as the intended account and rejects reuse", async ({
    page,
    context,
    browser,
  }) => {
    // Renew an expired temporary membership rather than accidentally granting indefinite access.
    await command("test_expire_membership", "", { id: "acme:taylor" });
    await login(context, "sam");
    await openWorkspace(page);
    await page
      .getByRole("button", { name: "Invite responder", exact: true })
      .click();
    await page.getByLabel("Responder account").selectOption("taylor");
    await page
      .getByLabel("Assigned role", { exact: true })
      .selectOption("analyst");
    await page
      .getByRole("button", { name: "Generate invitation", exact: true })
      .click();
    await expect(
      page.getByText("Simulated invitation delivery", { exact: true }),
    ).toBeVisible();
    const link = await page.getByLabel("One-time activation link").inputValue();
    const secret = secretOf(link);
    const guest = await browser.newContext();
    await login(guest, "taylor");
    const guestPage = await guest.newPage();
    await guestPage.goto(new URL(link).pathname);
    await expect(
      guestPage.getByRole("heading", { name: "Join Acme" }),
    ).toBeVisible();
    await guestPage
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(
      guestPage.getByRole("heading", { name: "Team", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Taylor Morgan", { exact: true }).first(),
    ).toBeVisible();
    const reuse = await post(guest.request, "invitations/accept", {
      token: secret,
    });
    expect(reuse.status()).toBe(400);
    expect((await reuse.json()).code).toBe("INVITATION_USED");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("link", { name: "Manage organization members", exact: true })
      .click();
    const membership = page
      .getByRole("row")
      .filter({ hasText: "Taylor Morgan" });
    await expect(membership).toContainText("Security Analyst");
    await expect(membership).toContainText("Temporary");
    await command("test_expire_membership", "", { id: "acme:taylor" });
    await expect(
      guestPage.getByRole("heading", { name: "Access revoked", exact: true }),
    ).toBeVisible();
    expect(
      (
        await guest.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041",
        )
      ).status(),
    ).toBe(403);

    await guest.close();
    await command("test_restore_memberships", "", {});
  });

  test("enforces one-hour expiry, recipient binding, revocation and replacement tokens", async ({
    context,
    browser,
  }) => {
    await login(context, "sam");
    const invitation = await invite(context.request);
    expect(Number(invitation.expiresAt) - Date.now()).toBeGreaterThan(
      3_590_000,
    );
    expect(Number(invitation.expiresAt) - Date.now()).toBeLessThanOrEqual(
      3_600_000,
    );
    const wrong = await browser.newContext();
    await login(wrong, "alex");
    const mismatch = await post(wrong.request, "invitations/accept", {
      token: secretOf(invitation.link),
    });
    expect(mismatch.status()).toBe(403);
    await wrong.close();
    await command("test_expire_invitation", "", { id: invitation.id });
    const guest = await browser.newContext();
    await login(guest, "taylor");
    const expired = await post(guest.request, "invitations/accept", {
      token: secretOf(invitation.link),
    });
    expect((await expired.json()).code).toBe("INVITATION_EXPIRED");
    const page = await guest.newPage();
    await page.goto(new URL(invitation.link).pathname);
    await expect(
      page.getByRole("heading", { name: "Invitation expired" }),
    ).toBeVisible();
    const replaced = await post(context.request, "invitations", {
      organizationId: "acme",
      incidentId: "IR-2041",
      role: "analyst",
      userId: "taylor",
      replaceId: invitation.id,
    });
    expect(replaced.status()).toBe(201);
    const replacement = await replaced.json();
    expect(replacement.link).not.toBe(invitation.link);
    const revokedOld = await post(guest.request, "invitations/accept", {
      token: secretOf(invitation.link),
    });
    expect((await revokedOld.json()).code).toBe("INVITATION_USED");
    expect(
      (
        await post(context.request, "invitations/revoke", {
          organizationId: "acme",
          id: replacement.id,
        })
      ).status(),
    ).toBe(200);
    const revokedNew = await post(guest.request, "invitations/accept", {
      token: secretOf(replacement.link),
    });
    expect((await revokedNew.json()).code).toBe("INVITATION_USED");
    await guest.close();
  });

  test("confirms invitation replacement and revocation through the administration UI", async ({
    page,
    context,
  }) => {
    await login(context, "sam");
    const phone =
      "+1555" +
      randomBytes(4).readUInt32BE().toString().padStart(7, "0").slice(-7);
    const created = await post(context.request, "invitations", {
      organizationId: "acme",
      incidentId: "IR-2041",
      role: "analyst",
      phone,
      contactVerified: true,
    });
    expect(created.status()).toBe(201);
    const original = await created.json();
    await page.goto("/org/acme/invitations");
    const row = page.getByRole("row").filter({ hasText: phone });
    await row
      .getByRole("button", { name: "Generate replacement", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Replace this invitation?",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const preview = async (link: string) =>
      withGateway(
        async (connection) =>
          JSON.parse(
            await connection.procedures.invitationPreview({
              tokenHash: tokenHash(secretOf(link)),
            }),
          ) as { status: string },
      );
    expect((await preview(original.link)).status).toBe("pending");
    await row
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
    const newLink = await page
      .getByLabel("One-time activation link")
      .inputValue();
    expect((await preview(original.link)).status).toBe("revoked");
    expect((await preview(newLink)).status).toBe("pending");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page
      .getByRole("row")
      .filter({ hasText: phone })
      .filter({ hasText: /pending/i })
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Confirm invitation revocation",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await preview(newLink)).status)
      .toBe("revoked");
  });

  test("changes a role immediately in a second open session and preserves the last administrator", async ({
    page,
    context,
    browser,
  }) => {
    await login(context, "sam");
    const analyst = await browser.newContext();
    await login(analyst, "alex");
    const analystPage = await analyst.newPage();
    await openWorkspace(analystPage);
    expect(
      (
        await analyst.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041&permission=evidence:upload",
        )
      ).status(),
    ).toBe(200);
    await openWorkspace(page);
    await page
      .getByRole("link", { name: "Manage organization members", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit Alex Rivera", exact: true })
      .click();
    await page
      .getByLabel("Assigned role", { exact: true })
      .selectOption("legal");
    await page
      .getByRole("button", { name: "Confirm role change", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Member role updated");
    await expect(analystPage.getByTestId("access-summary")).toContainText(
      "Legal/Compliance",
    );
    expect(
      (
        await analyst.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041&permission=evidence:upload",
        )
      ).status(),
    ).toBe(403);
    const lastAdmin = await post(context.request, "members/revoke", {
      organizationId: "acme",
      userId: "sam",
    });
    expect((await lastAdmin.json()).code).toBe("LAST_ADMIN");
    expect(
      (
        await context.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041&permission=operations:approve",
        )
      ).status(),
    ).toBe(200);
    await analyst.close();
    await command("test_restore_memberships", "", {});
  });

  test("revokes access in an open workspace and rejects subsequent protected reads and writes", async ({
    page,
    context,
    browser,
  }) => {
    await login(context, "sam");
    const responder = await browser.newContext();
    await login(responder, "jordan");
    const responderPage = await responder.newPage();
    await openWorkspace(responderPage);
    await page.goto("/org/acme/members");
    await page
      .getByRole("button", { name: "Edit Jordan Davis", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm revocation", exact: true })
      .click();
    await expect(
      responderPage.getByRole("heading", {
        name: "Access revoked",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      responderPage.getByRole("heading", { name: "Team", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await responder.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041",
        )
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(responder.request, "members/role", {
          organizationId: "acme",
          userId: "jordan",
          role: "administrator",
        })
      ).status(),
    ).toBe(403);
    await responder.close();
    await command("test_restore_memberships", "", {});
  });

  test("expires active sessions and memberships through controlled database fixtures", async ({
    page,
    context,
  }) => {
    await login(context, "alex");
    await openWorkspace(page);
    await command("test_expire_membership", "", { id: "acme:alex" });
    await expect(
      page.getByRole("heading", { name: "Access revoked", exact: true }),
    ).toBeVisible();
    expect(
      (
        await context.request.get(
          "/api/workspace?organizationId=acme&incidentId=IR-2041",
        )
      ).status(),
    ).toBe(403);
    await command("test_restore_memberships", "", {});
    const cookie = (await context.cookies()).find(
      (c) => c.name === "aegis_session",
    )!;
    await command("test_expire_session", tokenHash(cookie.value), {});
    await expect(
      page.getByRole("heading", { name: "Session expired", exact: true }),
    ).toBeVisible();
    expect((await context.request.get("/api/session")).status()).toBe(401);
  });

  test("enrolls an independent phone recipient through a valid demo link without reusable plaintext passwords", async ({
    context,
    browser,
  }) => {
    await login(context, "sam");
    const result = await post(context.request, "invitations", {
      organizationId: "acme",
      incidentId: "IR-2041",
      role: "analyst",
      phone: "+15550102041",
      contactVerified: true,
    });
    expect(result.status()).toBe(201);
    const invitation = await result.json();
    const guest = await browser.newContext();
    const page = await guest.newPage();
    await page.goto(new URL(invitation.link).pathname);
    await expect(
      page.getByRole("heading", { name: "Join Acme" }),
    ).toBeVisible();
    await page.getByLabel("Full name", { exact: true }).fill("Casey Demo");
    await page
      .getByLabel("Choose an AEGIS account name")
      .fill(`casey.${randomBytes(6).toString("hex")}`);
    await page
      .getByLabel("Password (12 characters minimum)", { exact: true })
      .fill(randomBytes(24).toString("base64url"));
    await page
      .getByRole("button", { name: "Create account and accept", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Team", exact: true }),
    ).toBeVisible();
    const current = await (await guest.request.get("/api/session")).json();
    expect(current.user.name).toBe("Casey Demo");
    expect(current.access[0].role).toBe("analyst");
    await guest.close();
  });
});
