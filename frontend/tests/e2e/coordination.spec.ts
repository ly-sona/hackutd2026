import {
  test,
  expect,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DbConnection } from "../../src/module_bindings";
import { command } from "../../lib/server/gateway";
import { tokenHash } from "../../lib/server/password";
import type {
  Task,
  Page,
  Message,
  Conversation,
  Responder,
} from "../../lib/coordination";
import type {
  Finding,
  IncidentEvent,
  Notification,
  Evidence,
} from "../../lib/incident-model";
const origin = "http://127.0.0.1:3100",
  root = resolve(process.cwd(), ".."),
  base = "/org/acme/incidents/IR-2041",
  scope = { organizationId: "acme", incidentId: "IR-2041" };
function configure() {
  const c = JSON.parse(
    readFileSync(resolve(root, ".spacetime/e2e/gateway.json"), "utf8"),
  );
  process.env.SPACETIMEDB_SERVER_TOKEN = c.token;
  process.env.NEXT_PUBLIC_SPACETIMEDB_HOST = "http://127.0.0.1:3101";
  process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME = "aegis-e2e";
}
async function login(c: BrowserContext, id: string) {
  const account = (
    JSON.parse(
      readFileSync(resolve(root, ".spacetime/e2e/demo-accounts.json"), "utf8"),
    ) as { id: string; login: string; password: string }[]
  ).find((a) => a.id === id)!;
  expect(
    (
      await c.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { login: account.login, password: account.password },
      })
    ).status(),
  ).toBe(200);
}
const post = (
  r: APIRequestContext,
  action: string,
  data: object,
  clientRequestId: string = randomUUID(),
) =>
  r.post("/api/coordination", {
    headers: { Origin: origin },
    data: { ...scope, action, clientRequestId, ...data },
  });
async function ok<T = Record<string, string>>(
  r: APIRequestContext,
  action: string,
  data: object,
  id?: string,
): Promise<T> {
  const response = await post(r, action, data, id);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function hash(c: BrowserContext) {
  return tokenHash(
    (await c.cookies()).find((c) => c.name === "aegis_session")!.value,
  );
}
async function connect(c: BrowserContext) {
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
        "SELECT * FROM visible_coordination_data",
        "SELECT * FROM visible_incident_data",
        "SELECT * FROM visible_scope_data",
      ]),
  );
  return {
    conn,
    rows: <T>(kind: string, incident = "IR-2041") =>
      [...conn.db.visibleCoordinationData.iter()]
        .filter((r) => r.kind === kind && r.incidentId === incident)
        .map((r) => JSON.parse(r.body) as T),
    incident: <T>(kind: string) =>
      [...conn.db.visibleIncidentData.iter()]
        .filter((r) => r.kind === kind && r.incidentId === "IR-2041")
        .map((r) => JSON.parse(r.body) as T),
    scope: <T>(kind: string) =>
      [...conn.db.visibleScopeData.iter()]
        .filter((r) => r.kind === kind && r.incidentId === "IR-2041")
        .map((r) => JSON.parse(r.body) as T),
  };
}
const taskData = (title: string, extra: object = {}) => ({
  title,
  description:
    "Synthetic investigation work. Verify originals before completion.",
  kind: "Investigation",
  priority: "Critical",
  assignedUserId: "alex",
  backupUserId: "maya",
  dueAt: Date.now() + 3_600_000,
  references: [
    { kind: "evidence", id: "EV-018" },
    { kind: "finding", id: "IR-2041:F-04" },
    { kind: "scope", id: "acme:scope:SYS-CUSTOMER-DB" },
  ],
  ...extra,
});
const findingData = (title: string) => ({
  title,
  description:
    "Synthetic observation derived from a restricted source message.",
  category: "Observation",
  priority: "High",
  status: "Suspected",
  observedAt: Date.now(),
  assignedTo: "alex",
  relatedSystem: "Customer Database",
  reason: "Original message preserved.",
});
const pending = "Awaiting Acknowledgment";

test.describe("Phase 4 real communication, tasks and server paging", () => {
  test.describe.configure({ mode: "default" });
  test.beforeAll(async () => {
    configure();
    await command("test_restore_memberships", "", {});
  });
  test.afterEach(async () => {
    await command("test_restore_memberships", "", {});
  });
  test("seeds idempotently and reuses original evidence, graph entity, inventory and incident rooms", async ({
    context,
  }) => {
    await login(context, "maya");
    const d = await connect(context);
    try {
      const before = {
        messages: d.rows<Message>("message").length,
        tasks: d.rows<Task>("task").length,
        pages: d.rows<Page>("page").length,
      };
      expect(before.messages).toBeGreaterThanOrEqual(18);
      expect(before.tasks).toBeGreaterThanOrEqual(7);
      expect(
        d
          .rows<Conversation>("conversation")
          .filter((c) => c.type === "Incident Room"),
      ).toHaveLength(1);
      expect(
        d
          .rows<Conversation>("conversation", "IR-2042")
          .filter((c) => c.type === "Incident Room"),
      ).toHaveLength(1);
      expect(
        d.incident<Evidence>("evidence").filter((e) => e.id === "EV-018"),
      ).toHaveLength(1);
      expect(
        d
          .scope<{ id: string }>("entity")
          .filter((e) => e.id === "acme:scope:SYS-CUSTOMER-DB"),
      ).toHaveLength(1);
      expect(
        d.incident<{
          totalRecords: number;
          individuallyConfirmedRecords: number;
        }>("scopeSummary")[0].totalRecords,
      ).toBe(1240);
      expect(await command("coord.seed", "", {})).toEqual({ seeded: false });
      expect({
        messages: d.rows<Message>("message").length,
        tasks: d.rows<Task>("task").length,
        pages: d.rows<Page>("page").length,
      }).toEqual(before);
    } finally {
      d.conn.disconnect();
    }
  });
  test("delivers safe multiline messages to two browsers, opens original EV-018, and persists across refresh", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext();
    try {
      await login(maya, "maya");
      await login(alex, "alex");
      const first = await maya.newPage(),
        second = await alex.newPage();
      await first.goto(base + "/team");
      await second.goto(base + "/team");
      await expect(
        first.getByRole("heading", { name: "Team", exact: true }),
      ).toBeVisible();
      const text = `Synthetic realtime ${randomUUID()}\n<img src=x onerror=alert(1)>`;
      await first
        .getByRole("textbox", { name: "Message", exact: true })
        .fill(text);
      await first.getByRole("button", { name: "Send", exact: true }).click();
      await expect(second.getByText(text, { exact: true })).toBeVisible();
      expect(await second.locator("article img").count()).toBe(0);
      await second.reload();
      await expect(second.getByText(text, { exact: true })).toBeVisible();
      await second
        .locator("article")
        .filter({
          hasText: "Traffic continued after the reported isolation time",
        })
        .first()
        .getByRole("button", { name: "Review evidence · EV-018", exact: true })
        .click();
      await expect(second.locator("pre")).toContainText("09:21");
      await second.keyboard.press("Escape");
      await first.getByLabel("Your availability").selectOption("Busy");
      await expect(
        second.getByRole("button", { name: "Message Maya Chen" }),
      ).toContainText("Busy");
      await first.getByLabel("Your availability").selectOption("Available");
    } finally {
      await maya.close();
      await alex.close();
    }
  });
  test("deduplicates retried sends and preserves server order, corrections and personal unread positions", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    const d = await connect(alex);
    try {
      const conversationId = "acme:IR-2041:room",
        id = randomUUID(),
        content = "Retry-safe message " + id;
      const before = d
        .rows<Conversation>("conversation")
        .find((c) => c.id === conversationId)!.unread;
      const first = await ok(
        maya.request,
        "message.send",
        { conversationId, content, references: [] },
        id,
      );
      expect(
        await ok(
          maya.request,
          "message.send",
          { conversationId, content, references: [] },
          id,
        ),
      ).toEqual(first);
      expect(
        (
          await post(
            maya.request,
            "message.send",
            { conversationId, content: "Changed content", references: [] },
            id,
          )
        ).status(),
      ).toBe(409);
      await expect
        .poll(
          () =>
            d.rows<Message>("message").filter((m) => m.content === content)
              .length,
        )
        .toBe(1);
      await expect
        .poll(
          () =>
            d
              .rows<Conversation>("conversation")
              .find((c) => c.id === conversationId)!.unread,
        )
        .toBe(before + 1);
      const correction = await ok(maya.request, "message.send", {
        conversationId,
        content: "Correction: still unverified.",
        references: [],
        correctionOf: first.messageId,
      });
      await expect
        .poll(() =>
          d
            .rows<Message>("message")
            .some(
              (m) =>
                m.id === correction.messageId &&
                m.correctionOf === first.messageId,
            ),
        )
        .toBe(true);
      await ok(alex.request, "message.read", {
        conversationId,
        messageId: correction.messageId,
      });
      await expect
        .poll(
          () =>
            d
              .rows<Conversation>("conversation")
              .find((c) => c.id === conversationId)!.unread,
        )
        .toBe(0);
      const records = d
        .rows<Message>("message")
        .filter(
          (m) => m.id === first.messageId || m.id === correction.messageId,
        );
      expect(BigInt(records[0].id)).toBeLessThan(BigInt(records[1].id));
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
    }
  });
  test("creates rooms with new incidents and keeps DMs, admin access, notifications and tenant boundaries restricted", async ({
    browser,
  }) => {
    const contexts = await Promise.all(
      ["maya", "alex", "priya", "sam"].map(async (id) => {
        const c = await browser.newContext();
        await login(c, id);
        return c;
      }),
    );
    const [maya, alex, priya, sam] = contexts;
    const conns = await Promise.all(contexts.map(connect));
    const [md, ad, pd, sd] = conns;
    try {
      const dm = await ok(maya.request, "dm.create", { userId: "alex" });
      const text = "Private recipient test " + randomUUID();
      await ok(maya.request, "message.send", {
        conversationId: dm.conversationId,
        content: text,
        references: [],
      });
      await expect
        .poll(() => ad.rows<Message>("message").some((m) => m.content === text))
        .toBe(true);
      expect(pd.rows<Message>("message").some((m) => m.content === text)).toBe(
        false,
      );
      expect(sd.rows<Message>("message")).toEqual([]);
      expect(sd.rows<Conversation>("conversation")).toEqual([]);
      expect(
        pd
          .incident<Notification>("notification")
          .some((n) => n.conversationId === dm.conversationId),
      ).toBe(false);
      expect(
        (
          await post(priya.request, "message.send", {
            conversationId: dm.conversationId,
            content: "forged",
            references: [],
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await post(sam.request, "message.send", {
            conversationId: "acme:IR-2041:room",
            content: "admin bypass",
            references: [],
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await post(maya.request, "message.send", {
            organizationId: "another-org",
            conversationId: dm.conversationId,
            content: "tenant bypass",
            references: [],
          })
        ).status(),
      ).toBe(403);
      const res = await maya.request.post("/api/incident/create", {
        headers: { Origin: origin },
        data: {
          organizationId: "acme",
          title: "Coordination room fixture " + randomUUID(),
          description: "Synthetic incident room lifecycle.",
          type: "Other",
          severity: "Medium",
          discoveredAt: Date.now(),
          commanderId: "maya",
          systems: "",
          impact: "",
          responderIds: ["alex"],
        },
      });
      expect(res.status()).toBe(200);
      const inc = (await res.json()).incidentId;
      await expect
        .poll(() =>
          md
            .rows<Conversation>("conversation", inc)
            .some((c) => c.type === "Incident Room"),
        )
        .toBe(true);
      expect(
        (
          await post(alex.request, "message.send", {
            conversationId: dm.conversationId,
            content: "cross-incident",
            incidentId: "IR-2042",
            references: [],
          })
        ).status(),
      ).toBe(404);
    } finally {
      conns.forEach((d) => d.conn.disconnect());
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
  test("converts a DM into a real task and finding without leaking source, timeline, graph or notifications", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      priya = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(priya, "priya");
    const ad = await connect(alex),
      pd = await connect(priya);
    try {
      const dm = await ok(maya.request, "dm.create", { userId: "alex" });
      const msg = await ok(maya.request, "message.send", {
        conversationId: dm.conversationId,
        content: "Private scope review " + randomUUID(),
        references: [
          { kind: "evidence", id: "EV-018" },
          { kind: "scope", id: "acme:scope:SYS-CUSTOMER-DB" },
        ],
      });
      const task = await ok(
        maya.request,
        "task.create",
        taskData("Private task " + randomUUID(), {
          sourceMessageId: msg.messageId,
        }),
      );
      const finding = await ok(maya.request, "finding.create", {
        ...findingData("Private finding " + randomUUID()),
        sourceMessageId: msg.messageId,
        references: [{ kind: "evidence", id: "EV-018" }],
      });
      await expect
        .poll(
          () =>
            ad.rows<Task>("task").find((t) => t.id === task.taskId)
              ?.sourceMessageId,
        )
        .toBe(msg.messageId);
      await expect
        .poll(() =>
          ad
            .incident<Finding>("finding")
            .some((f) => f.id === finding.findingId),
        )
        .toBe(true);
      expect(pd.rows<Task>("task").some((t) => t.id === task.taskId)).toBe(
        false,
      );
      expect(
        pd.incident<Finding>("finding").some((f) => f.id === finding.findingId),
      ).toBe(false);
      expect(
        pd
          .incident<IncidentEvent>("event")
          .some(
            (e) =>
              e.findingId === finding.findingId ||
              e.newValue.includes(task.taskId),
          ),
      ).toBe(false);
      expect(
        pd
          .scope<{ reference: string }>("entity")
          .some((e) => e.reference === finding.findingId),
      ).toBe(false);
      expect(
        pd
          .incident<Notification>("notification")
          .some(
            (n) =>
              n.findingId === finding.findingId || n.taskId === task.taskId,
          ),
      ).toBe(false);
      expect(
        (
          await post(priya.request, "task.update", {
            taskId: task.taskId,
            status: "In Progress",
            comment: "forged",
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await post(maya.request, "message.send", {
            conversationId: "acme:IR-2041:room",
            content: "restricted reference",
            references: [{ kind: "task", id: task.taskId }],
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await post(
            maya.request,
            "task.create",
            taskData("Invalid private assignment", {
              sourceMessageId: msg.messageId,
              assignedUserId: "priya",
            }),
          )
        ).status(),
      ).toBe(400);
      expect(
        (
          await post(
            maya.request,
            "task.create",
            taskData("Invalid reference", {
              references: [{ kind: "evidence", id: "EV-999" }],
            }),
          )
        ).status(),
      ).toBe(403);
    } finally {
      ad.conn.disconnect();
      pd.conn.disconnect();
      await maya.close();
      await alex.close();
      await priya.close();
    }
  });
  test("tracks evidence-backed task progress and independent verification without resolving linked finding or scope", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      priya = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(priya, "priya");
    const d = await connect(maya);
    try {
      const before = d
          .incident<Finding>("finding")
          .find((f) => f.id === "IR-2041:F-04")!,
        assessment = d
          .scope<{ id: string; status: string }>("assessment")
          .map((a) => [a.id, a.status]);
      const task = await ok(
        maya.request,
        "task.create",
        taskData("Verification lifecycle " + randomUUID()),
      );
      expect(
        (
          await post(alex.request, "task.update", {
            taskId: task.taskId,
            status: "Completed",
            comment: "skip review",
          })
        ).status(),
      ).toBe(400);
      await ok(alex.request, "task.update", {
        taskId: task.taskId,
        status: "In Progress",
        comment: "Reviewing original log.",
      });
      await ok(alex.request, "task.update", {
        taskId: task.taskId,
        status: "Awaiting Verification",
        comment: "Evidence reviewed; requesting independent verification.",
      });
      expect(
        (
          await post(alex.request, "task.update", {
            taskId: task.taskId,
            status: "Completed",
            comment: "self verification",
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await post(priya.request, "task.update", {
            taskId: task.taskId,
            status: "Completed",
            comment: "unauthorized technical reviewer",
          })
        ).status(),
      ).toBe(403);
      await ok(maya.request, "task.update", {
        taskId: task.taskId,
        status: "Completed",
        comment:
          "Independently compared the preserved traffic record. Work is documented; finding remains separate.",
      });
      await expect
        .poll(
          () =>
            d.rows<Task>("task").find((t) => t.id === task.taskId)?.verifiedBy,
        )
        .toBe("maya");
      expect(
        d.incident<Finding>("finding").find((f) => f.id === before.id)!.status,
      ).toBe(before.status);
      expect(
        d
          .scope<{ id: string; status: string }>("assessment")
          .map((a) => [a.id, a.status]),
      ).toEqual(assessment);
      expect(
        d
          .incident<IncidentEvent>("event")
          .filter((e) => e.type === "task" && e.newValue.includes(task.taskId))
          .length,
      ).toBe(4);
      await ok(alex.request, "task.update", {
        taskId: task.taskId,
        status: "In Progress",
        comment: "Explicitly reopen additional investigation work.",
      });
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
      await priya.close();
    }
  });
  test("rejects evidence-free investigation completion, supports reviewed coordination work, and forbids arbitrary reassignment", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      jordan = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(jordan, "jordan");
    try {
      const task = await ok(
        maya.request,
        "task.create",
        taskData("Evidence missing " + randomUUID(), { references: [] }),
      );
      await ok(alex.request, "task.update", {
        taskId: task.taskId,
        status: "In Progress",
        comment: "Investigating.",
      });
      await ok(alex.request, "task.update", {
        taskId: task.taskId,
        status: "Awaiting Verification",
        comment: "Review requested.",
      });
      expect(
        (
          await post(maya.request, "task.update", {
            taskId: task.taskId,
            status: "Completed",
            comment: "No evidence.",
          })
        ).status(),
      ).toBe(400);
      await ok(maya.request, "task.update", {
        taskId: task.taskId,
        status: "Completed",
        comment: "Reviewed supporting artifact.",
        references: [{ kind: "evidence", id: "EV-018" }],
      });
      const coordination = await ok(
        maya.request,
        "task.create",
        taskData("Support coordination " + randomUUID(), {
          kind: "Coordination",
          priority: "Medium",
          assignedUserId: "jordan",
          references: [{ kind: "scope", id: "acme:scope:OP-SUPPORT" }],
        }),
      );
      await ok(jordan.request, "task.update", {
        taskId: coordination.taskId,
        status: "In Progress",
        comment: "Coordinating support.",
      });
      await ok(jordan.request, "task.update", {
        taskId: coordination.taskId,
        status: "Awaiting Verification",
        comment: "Support handoff recorded.",
      });
      await ok(maya.request, "task.update", {
        taskId: coordination.taskId,
        status: "Completed",
        comment: "Reviewed the coordination note and confirmed handoff.",
      });
      expect(
        (
          await post(
            jordan.request,
            "task.create",
            taskData("Forbidden assignment", {
              kind: "Coordination",
              references: [],
            }),
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await post(
            maya.request,
            "task.create",
            taskData("Inactive assignee", { assignedUserId: "taylor" }),
          )
        ).status(),
      ).toBe(400);
      expect(
        (
          await post(
            maya.request,
            "task.create",
            taskData("Cross-incident evidence", { incidentId: "IR-2042" }),
          )
        ).status(),
      ).toBe(403);
    } finally {
      await maya.close();
      await alex.close();
      await jordan.close();
    }
  });
  test("keeps High priority separate from explicit paging and separates notification reads, acknowledgment, tasks and findings", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext(),
      priya = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    await login(priya, "priya");
    const d = await connect(alex);
    try {
      const receiptTitle = "Receipt only " + randomUUID();
      const task = await ok(
        maya.request,
        "task.create",
        taskData(receiptTitle, {
          priority: "High",
          dueAt: Date.now() - 60000,
        }),
      );
      await expect
        .poll(() => d.rows<Task>("task").some((t) => t.id === task.taskId))
        .toBe(true);
      expect(d.rows<Page>("page").some((p) => p.taskId === task.taskId)).toBe(
        false,
      );
      const page = await ok(maya.request, "page.create", {
        taskId: task.taskId,
      });
      await expect
        .poll(
          () => d.rows<Page>("page").find((p) => p.id === page.pageId)?.status,
        )
        .toBe(pending);
      const current = d.rows<Page>("page").find((p) => p.id === page.pageId)!;
      expect(
        Number(current.acknowledgmentDeadline) - Number(current.createdAt),
      ).toBe(300000);
      expect(
        (
          await post(priya.request, "page.acknowledge", { pageId: page.pageId })
        ).status(),
      ).toBe(403);
      await expect
        .poll(() =>
          d
            .incident<Notification>("notification")
            .some((n) => n.pageId === page.pageId),
        )
        .toBe(true);
      const notice = d
        .incident<Notification>("notification")
        .find((n) => n.pageId === page.pageId)!;
      expect(
        (
          await alex.request.post("/api/incident/notifications/read", {
            headers: { Origin: origin },
            data: { ...scope, notificationId: notice.id },
          })
        ).status(),
      ).toBe(200);
      expect(
        d.rows<Page>("page").find((p) => p.id === page.pageId)!.status,
      ).toBe(pending);
      const browserPage = await alex.newPage();
      await browserPage.goto(base + "/overview");
      await expect(
        browserPage
          .getByTestId("urgent-page")
          .filter({ hasText: receiptTitle }),
      ).toBeVisible();
      await browserPage
        .getByTestId("urgent-page")
        .filter({ hasText: receiptTitle })
        .getByRole("button", { name: "Acknowledge receipt" })
        .click();
      await expect
        .poll(
          () => d.rows<Page>("page").find((p) => p.id === page.pageId)?.status,
        )
        .toBe("Acknowledged");
      expect(
        d.rows<Task>("task").find((t) => t.id === task.taskId)!.status,
      ).toBe("Open");
      await expect(
        browserPage
          .getByTestId("attention-task")
          .filter({ hasText: receiptTitle }),
      ).toContainText("Overdue");
      expect(
        d.incident<Finding>("finding").find((f) => f.id === "IR-2041:F-04")!
          .status,
      ).not.toBe("Resolved");
      await command("coord.test.page_due", await hash(maya), {
        ...scope,
        pageId: page.pageId,
        clientRequestId: randomUUID(),
      }).then(
        () => {
          throw new Error("Terminal page fixture should reject");
        },
        (e) => expect(String(e)).toContain("Pending original page"),
      );
      expect(
        d.rows<Page>("page").some((p) => p.parentPageId === page.pageId),
      ).toBe(false);
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
      await priya.close();
    }
  });
  test("escalates once on the server after requester browser closes, with duplicate ticks and explicit backup acknowledgment", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    const d = await connect(alex);
    let taskId = "",
      pageId = "";
    try {
      const task = await ok(
        maya.request,
        "task.create",
        taskData("Browser-independent paging " + randomUUID()),
      );
      taskId = task.taskId;
      const page = await ok(maya.request, "page.create", { taskId });
      pageId = page.pageId;
      const session = await hash(maya);
      await maya.close();
      await command("coord.test.page_due", session, {
        ...scope,
        pageId,
        clientRequestId: randomUUID(),
      });
      await expect
        .poll(() => d.rows<Page>("page").find((p) => p.id === pageId)?.status)
        .toBe("Escalated");
      await expect
        .poll(
          () =>
            d.rows<Page>("page").filter((p) => p.parentPageId === pageId)
              .length,
        )
        .toBe(1);
      const child = d
        .rows<Page>("page")
        .find((p) => p.parentPageId === pageId)!;
      expect(child.pagedUserId).toBe("maya");
      expect(child.acknowledgmentDeadline).toBe("0");
      const firstTime = child.createdAt;
      await expect
        .poll(() => Number(d.rows<{ now: string }>("policy")[0].now))
        .toBeGreaterThan(Number(firstTime) + 2100);
      expect(
        d.rows<Page>("page").filter((p) => p.parentPageId === pageId),
      ).toHaveLength(1);
      expect(
        d
          .incident<IncidentEvent>("event")
          .filter(
            (e) =>
              e.type === "page" &&
              e.title === "Page escalated" &&
              e.newValue.includes(pageId),
          ),
      ).toHaveLength(1);
      expect(
        (await post(alex.request, "page.acknowledge", { pageId })).status(),
      ).toBe(409);
      const reopened = await browser.newContext();
      await login(reopened, "maya");
      await ok(reopened.request, "page.acknowledge", { pageId: child.id });
      await expect
        .poll(() => d.rows<Page>("page").find((p) => p.id === child.id)?.status)
        .toBe("Acknowledged");
      expect(d.rows<Task>("task").find((t) => t.id === taskId)!.status).toBe(
        "Open",
      );
      await reopened.close();
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
    }
  });
  test("warns for unavailable targets, cancels pages on task cancellation/reassignment, and does not let clients choose deadlines", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    const d = await connect(maya);
    try {
      await ok(alex.request, "availability", {
        status: "Unavailable",
        userId: "maya",
      });
      await expect
        .poll(
          () =>
            d.rows<Responder>("responder").find((r) => r.id === "alex")
              ?.availability,
        )
        .toBe("Unavailable");
      expect(
        d.rows<Responder>("responder").find((r) => r.id === "maya")!
          .availability,
      ).not.toBe("Unavailable");
      const task = await ok(
        maya.request,
        "task.create",
        taskData("Cancellation " + randomUUID()),
      );
      expect(
        (
          await post(maya.request, "page.create", { taskId: task.taskId })
        ).status(),
      ).toBe(400);
      const page = await ok(maya.request, "page.create", {
        taskId: task.taskId,
        confirmAvailability: true,
        acknowledgmentDeadline: 1,
      });
      await expect
        .poll(
          () => d.rows<Page>("page").find((p) => p.id === page.pageId)?.status,
        )
        .toBe(pending);
      expect(
        Number(
          d.rows<Page>("page").find((p) => p.id === page.pageId)!
            .acknowledgmentDeadline,
        ),
      ).toBeGreaterThan(Date.now());
      await ok(maya.request, "task.update", {
        taskId: task.taskId,
        status: "Canceled",
        comment: "Investigation reassigned outside this task.",
      });
      await expect
        .poll(
          () => d.rows<Page>("page").find((p) => p.id === page.pageId)?.status,
        )
        .toBe("Canceled");
      const second = await ok(
        maya.request,
        "task.create",
        taskData("Reassignment " + randomUUID()),
      );
      const secondPage = await ok(maya.request, "page.create", {
        taskId: second.taskId,
        confirmAvailability: true,
      });
      await ok(maya.request, "task.update", {
        taskId: second.taskId,
        status: "Open",
        comment: "Reassigned to a different authorized responder.",
        assignedUserId: "maya",
        backupUserId: "alex",
        dueAt: 0,
      });
      await expect
        .poll(
          () =>
            d.rows<Page>("page").find((p) => p.id === secondPage.pageId)
              ?.status,
        )
        .toBe("Canceled");
      await ok(alex.request, "availability", { status: "Available" });
    } finally {
      d.conn.disconnect();
      await maya.close();
      await alex.close();
    }
  });
  test("reacts to incident revocation, rejects revoked backups, and preserves DM history only for remaining authorized participants", async ({
    browser,
  }) => {
    const maya = await browser.newContext(),
      alex = await browser.newContext();
    await login(maya, "maya");
    await login(alex, "alex");
    const md = await connect(maya),
      ad = await connect(alex);
    try {
      const dm = await ok(maya.request, "dm.create", { userId: "alex" });
      const msg = await ok(maya.request, "message.send", {
        conversationId: dm.conversationId,
        content: "Revocation fixture " + randomUUID(),
        references: [],
      });
      const task = await ok(
        maya.request,
        "task.create",
        taskData("Revoked recipient " + randomUUID()),
      );
      const page = await ok(maya.request, "page.create", {
        taskId: task.taskId,
      });
      await command("test_remove_incident", "", { userId: "alex" });
      await expect.poll(() => ad.rows<Message>("message").length).toBe(0);
      await expect
        .poll(
          () => md.rows<Page>("page").find((p) => p.id === page.pageId)?.status,
        )
        .toBe("Escalated");
      expect(
        md.rows<Message>("message").some((m) => m.id === msg.messageId),
      ).toBe(true);
      expect(
        (
          await post(maya.request, "message.send", {
            conversationId: dm.conversationId,
            content: "blocked",
            references: [],
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await post(alex.request, "page.acknowledge", { pageId: page.pageId })
        ).status(),
      ).toBe(403);
      const child = md
        .rows<Page>("page")
        .find((p) => p.parentPageId === page.pageId)!;
      await ok(maya.request, "page.acknowledge", { pageId: child.id });
      await command("test_restore_memberships", "", {});
      const second = await ok(
        alex.request,
        "task.create",
        taskData("Revoked backup " + randomUUID()),
      );
      const secondPage = await ok(alex.request, "page.create", {
        taskId: second.taskId,
      });
      await command("test_remove_incident", "", { userId: "maya" });
      await command("coord.test.page_due", await hash(alex), {
        ...scope,
        pageId: secondPage.pageId,
        clientRequestId: randomUUID(),
      });
      await expect
        .poll(
          () =>
            ad.rows<Page>("page").find((p) => p.id === secondPage.pageId)
              ?.status,
        )
        .toBe("Canceled");
      expect(
        ad.rows<Page>("page").some((p) => p.parentPageId === secondPage.pageId),
      ).toBe(false);
    } finally {
      md.conn.disconnect();
      ad.conn.disconnect();
      await maya.close();
      await alex.close();
    }
  });
  test("converts a message through the UI, opens shared task details, and retains original-source navigation on desktop and mobile", async ({
    context,
    page,
  }) => {
    await login(context, "maya");
    const dm = await ok(context.request, "dm.create", { userId: "alex" });
    const content = "UI source conversion " + randomUUID();
    const message = await ok(context.request, "message.send", {
      conversationId: dm.conversationId,
      content,
      references: [
        { kind: "evidence", id: "EV-018" },
        { kind: "scope", id: "acme:scope:SYS-CUSTOMER-DB" },
      ],
    });
    await page.goto(
      `${base}/team?conversation=${encodeURIComponent(dm.conversationId)}&message=${message.messageId}`,
    );
    const article = page.locator(`[data-message-id="${message.messageId}"]`);
    await expect(article).toContainText(content);
    await article
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    const form = page.getByRole("dialog");
    const title = "UI assigned task " + randomUUID();
    await form.getByLabel("Task title", { exact: true }).fill(title);
    await form
      .getByRole("combobox", { name: "Assignee", exact: true })
      .selectOption("alex");
    await form
      .getByRole("combobox", {
        name: "Backup responder (optional; otherwise Incident Commander)",
        exact: true,
      })
      .selectOption("maya");
    await form
      .getByRole("combobox", { name: "Priority", exact: true })
      .selectOption("High");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).not.toBeVisible();
    await article
      .getByRole("link", { name: `Task: ${title}`, exact: true })
      .click();
    const detail = page.getByRole("dialog");
    await expect(
      detail.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(detail).toContainText("Open");
    await detail
      .getByRole("button", { name: "Page responder", exact: true })
      .click();
    const pageForm = page.getByRole("dialog").last();
    await pageForm.getByRole("button", { name: "Save", exact: true }).click();
    await expect(detail.getByTestId("page-history")).toContainText(
      "Awaiting Acknowledgment",
    );
    await detail
      .getByRole("button", { name: "Cancel page", exact: true })
      .click();
    const cancel = page.getByRole("dialog").last();
    await cancel
      .getByLabel("Cancellation reason")
      .fill("UI workflow verified; cancel test page.");
    await cancel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(detail.getByTestId("page-history")).toContainText("Canceled");
    await detail
      .getByRole("link", {
        name: "Open original message · Restricted to its conversation",
      })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.locator(`[data-message-id="${message.messageId}"]`),
    ).toContainText(content);
    await page
      .locator(`[data-message-id="${message.messageId}"]`)
      .getByRole("button", { name: "Add finding", exact: true })
      .click();
    const findingForm = page.getByRole("dialog"),
      findingTitle = "UI converted finding " + randomUUID();
    await findingForm.getByLabel("Finding title").fill(findingTitle);
    await findingForm
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(findingForm).not.toBeVisible();
    await page
      .locator(`[data-message-id="${message.messageId}"]`)
      .getByRole("link", { name: "Open converted finding" })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: findingTitle }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Open original message", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Team", exact: true }),
    ).toBeVisible();
    const output = resolve(root, ".spacetime/phase4-visual");
    mkdirSync(output, { recursive: true });
    await page.goto(base + "/team");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(output, "team-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Send", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: resolve(output, "team-mobile.png"),
      fullPage: true,
    });
  });
  test("opens the original business operation for Operations without granting technical scope or evidence access", async ({
    context,
    page,
  }) => {
    await login(context, "jordan");
    await page.goto(
      `${base}/team?task=${encodeURIComponent("acme:IR-2041:T-03")}`,
    );
    const task = page.getByRole("dialog");
    await expect(
      task.getByRole("heading", { name: "Coordinate customer support access" }),
    ).toBeVisible();
    await task
      .getByRole("button", { name: /Business operation · Customer support/i })
      .click();
    const operation = page.getByRole("dialog").last();
    await expect(
      operation.getByRole("heading", { name: "Customer Support", exact: true }),
    ).toBeVisible();
    await expect(operation).toContainText("acme:scope:OP-SUPPORT");
    expect(
      await operation.getByRole("button", { name: /Approve/ }).count(),
    ).toBe(0);
    expect((await context.request.get("/api/evidence/EV-018")).status()).toBe(
      403,
    );
  });
  test("allocates distinct durable task/page identifiers and creates no task when urgent-page validation fails", async ({
    context,
  }) => {
    await login(context, "maya");
    const d = await connect(context);
    try {
      const ids = new Set<string>();
      for (let i = 0; i < 8; i++) {
        const id = randomUUID(),
          data = taskData(`Identifier allocation ${id}`, {
            kind: "Coordination",
            references: [],
            priority: "High",
          });
        const task = await ok(context.request, "task.create", data, id);
        expect(task.taskId[14]).toBe("7");
        expect(ids.has(task.taskId)).toBe(false);
        ids.add(task.taskId);
        expect(await ok(context.request, "task.create", data, id)).toEqual(
          task,
        );
      }
      const title = "Atomic urgent rejection " + randomUUID();
      expect(
        (
          await post(
            context.request,
            "task.create",
            taskData(title, { priority: "Medium", page: true }),
          )
        ).status(),
      ).toBe(400);
      expect(d.rows<Task>("task").some((t) => t.title === title)).toBe(false);
      const taskId = [...ids][0],
        operation = randomUUID();
      const page = await ok(
        context.request,
        "page.create",
        { taskId },
        operation,
      );
      expect(page.pageId[14]).toBe("7");
      expect(
        await ok(context.request, "page.create", { taskId }, operation),
      ).toEqual(page);
      await expect
        .poll(
          () => d.rows<Page>("page").filter((p) => p.taskId === taskId).length,
        )
        .toBe(1);
      await ok(context.request, "page.cancel", {
        pageId: page.pageId,
        reason: "Identifier allocation and retry semantics verified.",
      });
    } finally {
      d.conn.disconnect();
    }
  });
  test("guards private tables, service identity, CSRF, fixture routes and technical references", async ({
    browser,
  }) => {
    const jordan = await browser.newContext();
    await login(jordan, "jordan");
    const d = await connect(jordan);
    try {
      for (const table of [
        "messages",
        "conversations",
        "conversation_participants",
        "tasks",
        "pages",
        "responder_availability",
      ]) {
        await new Promise<void>((resolve, reject) => {
          d.conn
            .subscriptionBuilder()
            .onApplied(() =>
              reject(new Error("Private table was exposed: " + table)),
            )
            .onError(() => resolve())
            .subscribe([`SELECT * FROM ${table}`]);
        });
      }
      await expect(
        d.conn.reducers.accessCommand({
          requestId: randomUUID(),
          sessionHash: await hash(jordan),
          action: "coord.message.send",
          payload: JSON.stringify({
            ...scope,
            conversationId: "acme:IR-2041:room",
            content: "bypass",
            references: [],
            clientRequestId: randomUUID(),
          }),
        }),
      ).rejects.toThrow("Trusted server required");
      expect(
        (
          await jordan.request.post("/api/coordination", {
            headers: { Origin: "http://evil.invalid" },
            data: { ...scope, action: "message.send" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await post(jordan.request, "test.page_due", { pageId: "anything" })
        ).status(),
      ).toBe(400);
      expect(
        (
          await post(jordan.request, "message.send", {
            conversationId: "acme:IR-2041:room",
            content: "technical reference",
            references: [{ kind: "evidence", id: "EV-018" }],
          })
        ).status(),
      ).toBe(403);
      expect(d.incident<Evidence>("evidence")).toEqual([]);
    } finally {
      d.conn.disconnect();
      await jordan.close();
    }
  });
});
