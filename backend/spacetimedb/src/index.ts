import { recoveryTables } from "./recovery-schema";
import { renameDemoCompany } from "./demo-consistency";
import {
  recoveryCommand,
  recoveryProjection,
  recoveryRead,
  processRecovery,
} from "./recovery-domain";
import {
  schema,
  table,
  t,
  SenderError,
  ScheduleAt,
  type ReducerCtx,
  type ViewCtx,
} from "spacetimedb/server";
import { coordinationTables } from "./coord-schema";
import {
  coordinationCommand,
  coordinationProjection,
  processPages,
} from "./coord-domain";
import { scopeTables } from "./scope-schema";
import {
  scopeCommand,
  scopeProjection,
  scopeRead,
  scopeSnapshot,
} from "./scope-domain";
import { incidentTables } from "./incident-schema";
import {
  incidentCommand,
  incidentProjection,
  incidentAccessEvent,
  evidenceDescriptor,
} from "./incident-domain";
import { Identity } from "spacetimedb";
import { matrix, isRole, type Permission } from "./permissions";
import {
  membershipExpiryForInvitation,
  TEMPORARY_MEMBERSHIP_MS,
} from "./membership-policy";

const organizations = table(
  {},
  {
    id: t.string().primaryKey(),
    name: t.string(),
    status: t.string(),
    createdAt: t.timestamp(),
  },
);
const users = table(
  {},
  {
    id: t.string().primaryKey(),
    authSubject: t.string().unique(),
    name: t.string(),
    displayName: t.string(),
    contactMethod: t.string(),
    contactValue: t.string(),
    accountStatus: t.string(),
    createdAt: t.timestamp(),
  },
);
const credentials = table(
  {},
  {
    login: t.string().primaryKey(),
    userId: t.string().unique(),
    passwordHash: t.string(),
  },
);
const memberships = table(
  {},
  {
    id: t.string().primaryKey(),
    userId: t.string().index("btree"),
    organizationId: t.string().index("btree"),
    role: t.string(),
    status: t.string(),
    expiresAt: t.u64(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
);
const incidentStubs = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string().index("btree"),
    title: t.string(),
  },
);
const incidentMemberships = table(
  {},
  {
    id: t.string().primaryKey(),
    incidentId: t.string(),
    userId: t.string().index("btree"),
    organizationId: t.string().index("btree"),
    membershipStatus: t.string(),
    createdAt: t.timestamp(),
  },
);
const invitations = table(
  {},
  {
    id: t.string().primaryKey(),
    organizationId: t.string().index("btree"),
    incidentId: t.string(),
    intendedRole: t.string(),
    recipientContact: t.string(),
    intendedUserId: t.string(),
    tokenHash: t.string().unique(),
    createdBy: t.string(),
    createdAt: t.timestamp(),
    expiresAt: t.u64(),
    acceptedAt: t.u64(),
    revokedAt: t.u64(),
    status: t.string(),
  },
);
const sessions = table(
  {},
  {
    hash: t.string().primaryKey(),
    userId: t.string().index("btree"),
    expiresAt: t.u64(),
    createdAt: t.timestamp(),
  },
);
const connectionGrants = table(
  {},
  {
    identity: t.identity().primaryKey(),
    sessionHash: t.string().index("btree"),
  },
);
const accessAuditEvents = table(
  {},
  {
    id: t.u64().primaryKey().autoInc(),
    organizationId: t.string().index("btree"),
    actorUserId: t.string(),
    targetUserId: t.string(),
    action: t.string(),
    timestamp: t.timestamp(),
    outcome: t.string(),
    metadata: t.string(),
  },
);
const loginAttempts = table(
  {},
  { login: t.string().primaryKey(), failures: t.u32(), blockedUntil: t.u64() },
);
// Reducer result envelopes keep rejection audits committed without pretending a rejected write succeeded.
const commandResults = table(
  {},
  { id: t.string().primaryKey(), result: t.string(), createdAt: t.timestamp() },
);
const accessClock = table({}, { id: t.u32().primaryKey(), now: t.u64() });
const accessTimer = table(
  {},
  { id: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() },
);
const healthCheck = table(
  { name: "health_check", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    message: t.string(),
    created_at: t.timestamp(),
  },
);

const db = schema(
  {
    ...incidentTables,
    ...scopeTables,
    ...coordinationTables,
    ...recoveryTables,
    organizations,
    users,
    credentials,
    memberships,
    incidentStubs,
    incidentMemberships,
    invitations,
    sessions,
    connectionGrants,
    accessAuditEvents,
    loginAttempts,
    commandResults,
    accessClock,
    accessTimer,
    healthCheck,
  },
  {
    env: {
      AEGIS_GATEWAY_IDENTITY: t.option(t.string()),
      AEGIS_TEST_MODE: t.option(t.string()),
      AEGIS_DEVELOPMENT_MODE: t.option(t.string()),
      AEGIS_PAGE_ACK_SECONDS: t.option(t.string()),
    },
  },
);
export default db;
export type Ctx = ReducerCtx<typeof db.schemaType>;
type ReadCtx = ViewCtx<typeof db.schemaType>;
export type Reader = Pick<ReadCtx, "db" | "sender" | "env">;
class Denied extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const now = (ctx: Ctx) => ctx.timestamp.microsSinceUnixEpoch / 1000n;
const memberId = (org: string, user: string) => `${org}:${user}`;
const incidentKey = (org: string, incident: string, user: string) =>
  `${org}:${incident}:${user}`;
function gateway(ctx: Reader) {
  if (
    !ctx.env.AEGIS_GATEWAY_IDENTITY ||
    ctx.sender.toHexString() !== ctx.env.AEGIS_GATEWAY_IDENTITY
  )
    throw new SenderError("Trusted server required.");
}
function session(ctx: Reader, hash: string, at: bigint) {
  const value = ctx.db.sessions.hash.find(hash);
  const user = value && ctx.db.users.id.find(value.userId);
  if (
    !value ||
    value.expiresAt <= at ||
    !user ||
    user.accountStatus !== "active"
  )
    throw new Denied(
      "SESSION_EXPIRED",
      "Your session has expired. Sign in again.",
    );
  return { ...value, user };
}
function activeMember(ctx: Reader, org: string, user: string, at: bigint) {
  const member = ctx.db.memberships.id.find(memberId(org, user));
  const organization = ctx.db.organizations.id.find(org);
  return member &&
    organization?.status === "active" &&
    member.status === "active" &&
    (member.expiresAt === 0n || member.expiresAt > at) &&
    isRole(member.role)
    ? member
    : undefined;
}
function authorize(
  ctx: Reader,
  hash: string,
  org: string,
  incident: string,
  permission: Permission,
  at: bigint,
) {
  const actor = session(ctx, hash, at);
  const member = activeMember(ctx, org, actor.userId, at);
  if (!member || !isRole(member.role))
    throw new Denied(
      "ACCESS_REVOKED",
      "You do not have active access to this organization.",
    );
  if (
    incident &&
    member.role === "administrator" &&
    !ctx.db.incidentStubs.id.find(`${org}:${incident}`)
  )
    throw new Denied(
      "ACCESS_DENIED",
      "Incident unavailable in this organization.",
    );
  if (
    incident &&
    member.role !== "administrator" &&
    ctx.db.incidentMemberships.id.find(incidentKey(org, incident, actor.userId))
      ?.membershipStatus !== "active"
  )
    throw new Denied("ACCESS_DENIED", "You are not assigned to this incident.");
  if (!matrix[member.role].includes(permission))
    throw new Denied("ACCESS_DENIED", "Your role does not allow this action.");
  return { actor, member };
}
function audit(
  ctx: Ctx,
  org: string,
  actor: string,
  target: string,
  action: string,
  outcome = "success",
  metadata = "",
) {
  ctx.db.accessAuditEvents.insert({
    id: 0n,
    organizationId: org,
    actorUserId: actor,
    targetUserId: target,
    action,
    timestamp: ctx.timestamp,
    outcome,
    metadata,
  });
  if (outcome === "success")
    incidentAccessEvent(ctx, org, actor, target, action, metadata);
}
function text(input: Record<string, unknown>, key: string, max = 200) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Denied("INVALID_INPUT", `Invalid ${key}.`);
  return value.trim();
}
function validRole(input: Record<string, unknown>) {
  const role = text(input, "role");
  if (!isRole(role))
    throw new Denied("INVALID_INPUT", "Choose a predefined role.");
  return role;
}
function validHash(input: Record<string, unknown>, key: string) {
  const hash = text(input, key);
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw new Denied("INVALID_INPUT", "Invalid security token.");
  return hash;
}
function passwordDigest(input: Record<string, unknown>) {
  const digest = text(input, "passwordHash", 512);
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(digest))
    throw new Denied("INVALID_INPUT", "A salted password hash is required.");
  return digest;
}
function inviteByHash(ctx: Reader, hash: string, at: bigint) {
  const invite = ctx.db.invitations.tokenHash.find(hash);
  if (!invite)
    throw new Denied("INVITATION_INVALID", "This invitation is not valid.");
  if (invite.status !== "pending")
    throw new Denied(
      "INVITATION_USED",
      "This invitation has already been used or revoked.",
    );
  if (invite.expiresAt <= at)
    throw new Denied(
      "INVITATION_EXPIRED",
      "This invitation has expired. Ask an administrator for a replacement.",
    );
  if (
    ctx.db.organizations.id.find(invite.organizationId)?.status !== "active" ||
    !ctx.db.incidentStubs.id.find(
      `${invite.organizationId}:${invite.incidentId}`,
    )
  )
    throw new Denied(
      "INVITATION_INVALID",
      "The invitation workspace is unavailable.",
    );
  return invite;
}
function grantMembership(
  ctx: Ctx,
  invite: ReturnType<typeof inviteByHash>,
  userId: string,
) {
  const id = memberId(invite.organizationId, userId);
  const old = ctx.db.memberships.id.find(id);
  const values = {
    id,
    userId,
    organizationId: invite.organizationId,
    role: invite.intendedRole,
    status: "active",
    expiresAt: membershipExpiryForInvitation(old?.expiresAt, now(ctx)),
    createdAt: old?.createdAt ?? ctx.timestamp,
    updatedAt: ctx.timestamp,
  };
  if (old) ctx.db.memberships.id.update(values);
  else ctx.db.memberships.insert(values);
  const key = incidentKey(invite.organizationId, invite.incidentId, userId);
  const association = {
    id: key,
    userId,
    incidentId: invite.incidentId,
    organizationId: invite.organizationId,
    membershipStatus: "active",
    createdAt: ctx.timestamp,
  };
  if (ctx.db.incidentMemberships.id.find(key))
    ctx.db.incidentMemberships.id.update(association);
  else ctx.db.incidentMemberships.insert(association);
  ctx.db.invitations.id.update({
    ...invite,
    status: "accepted",
    acceptedAt: now(ctx),
  });
  audit(
    ctx,
    invite.organizationId,
    userId,
    userId,
    "invitation.accepted",
    "success",
    invite.id,
  );
}
function serialize(value: unknown) {
  return JSON.stringify(value, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}
function publicUser(
  user: NonNullable<ReturnType<Ctx["db"]["users"]["id"]["find"]>>,
) {
  return {
    id: user.id,
    name: user.displayName,
    contact: user.contactValue,
    status: user.accountStatus,
  };
}

// One transactional command reducer: no client-controlled actor/role claim is trusted.
export const access_command = db.reducer(
  {
    requestId: t.string(),
    sessionHash: t.string(),
    action: t.string(),
    payload: t.string(),
  },
  (ctx, args) => {
    gateway(ctx);
    if (ctx.db.commandResults.id.find(args.requestId)) return;
    if (args.payload.length > 40_000 || args.requestId.length > 100)
      throw new SenderError("Invalid command.");
    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(args.payload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Denied("INVALID_INPUT", "Invalid request.");
      data = parsed as Record<string, unknown>;
      const result = execute(ctx, args.action, args.sessionHash, data);
      ctx.db.commandResults.insert({
        id: args.requestId,
        result: serialize({ ok: true, data: result }),
        createdAt: ctx.timestamp,
      });
    } catch (error) {
      if (!(error instanceof Denied)) throw error; // Unexpected failures roll back the entire transaction.
      const actor = ctx.db.sessions.hash.find(args.sessionHash)?.userId ?? "";
      const org =
        typeof data.organizationId === "string"
          ? data.organizationId.slice(0, 100)
          : "";
      audit(
        ctx,
        org,
        actor,
        typeof data.userId === "string" ? data.userId.slice(0, 100) : "",
        args.action,
        "denied",
        error.code,
      );
      ctx.db.commandResults.insert({
        id: args.requestId,
        result: serialize({
          ok: false,
          code: error.code,
          error: error.message,
        }),
        createdAt: ctx.timestamp,
      });
    }
  },
);

function execute(
  ctx: Ctx,
  action: string,
  hash: string,
  data: Record<string, unknown>,
): unknown {
  const at = now(ctx);
  if (action.startsWith("recovery."))
    return recoveryCommand(ctx, action, hash, data, {
      authorize,
      activeMember,
      fail: (code, message): never => {
        throw new Denied(code, message);
      },
    });
  if (action.startsWith("coord."))
    return coordinationCommand(ctx, action, hash, data, {
      authorize,
      activeMember,
      fail: (code, message): never => {
        throw new Denied(code, message);
      },
    });
  if (action.startsWith("scope."))
    return scopeCommand(ctx, action, hash, data, {
      authorize,
      activeMember,
      fail: (code, message): never => {
        throw new Denied(code, message);
      },
    });
  if (action.startsWith("incident."))
    return incidentCommand(ctx, action, hash, data, {
      authorize,
      activeMember,
      fail: (code, message): never => {
        throw new Denied(code, message);
      },
    });
  if (action === "bootstrap") {
    renameDemoCompany(ctx);
    if (ctx.db.users.count() > 0n) {
      // Keep one known synthetic invitation useful for the demo on existing DBs.
      const demoInvite = ctx.db.invitations.id.find("seed-invitation-1");
      if (
        demoInvite?.organizationId === "acme" &&
        demoInvite.intendedUserId === "taylor" &&
        demoInvite.status === "expired" &&
        demoInvite.revokedAt === 0n &&
        demoInvite.acceptedAt === 0n
      ) {
        ctx.db.invitations.id.update({
          ...demoInvite,
          status: "pending",
          expiresAt: at + 3600000n,
        });
      }
      return { seeded: false };
    }
    const seed = data.users;
    if (!Array.isArray(seed) || seed.length !== 6)
      throw new Denied("INVALID_INPUT", "Expected six seed profiles.");
    const profiles = seed.map((item) => {
      const p = item as Record<string, unknown>;
      return {
        id: text(p, "id"),
        name: text(p, "name"),
        login: text(p, "login"),
        passwordHash: passwordDigest(p),
        role: validRole(p),
      };
    });
    const invitationHashes = [0, 1, 2].map((i) =>
      validHash(data, `invitationHash${i}`),
    );
    for (const org of [
      { id: "acme", name: "Techniq" },
      { id: "northstar", name: "Northstar — restricted demonstration" },
    ]) {
      ctx.db.organizations.insert({
        ...org,
        status: "active",
        createdAt: ctx.timestamp,
      });
      ctx.db.incidentStubs.insert({
        id: `${org.id}:IR-2041`,
        organizationId: org.id,
        title:
          org.id === "acme" ? "Ransomware response" : "Restricted exercise",
      });
    }
    for (const p of profiles) {
      ctx.db.users.insert({
        id: p.id,
        authSubject: `aegis:${p.id}`,
        name: p.name,
        displayName: p.name,
        contactMethod: "synthetic",
        contactValue: p.login,
        accountStatus: "active",
        createdAt: ctx.timestamp,
      });
      ctx.db.credentials.insert({
        login: p.login,
        userId: p.id,
        passwordHash: p.passwordHash,
      });
      const pending = p.id === "taylor";
      ctx.db.memberships.insert({
        id: memberId("acme", p.id),
        userId: p.id,
        organizationId: "acme",
        role: p.role,
        status: pending ? "pending" : "active",
        expiresAt: pending ? at + TEMPORARY_MEMBERSHIP_MS : 0n,
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      ctx.db.incidentMemberships.insert({
        id: incidentKey("acme", "IR-2041", p.id),
        incidentId: "IR-2041",
        userId: p.id,
        organizationId: "acme",
        membershipStatus: pending ? "pending" : "active",
        createdAt: ctx.timestamp,
      });
    }
    // No Techniq member belongs to Northstar. This fixture demonstrates cross-tenant denial.
    for (const [i, status] of ["pending", "expired", "revoked"].entries())
      ctx.db.invitations.insert({
        id: `seed-invitation-${i}`,
        organizationId: "acme",
        incidentId: "IR-2041",
        intendedRole: "analyst",
        recipientContact: "taylor.morgan",
        intendedUserId: "taylor",
        tokenHash: invitationHashes[i],
        createdBy: "sam",
        createdAt: ctx.timestamp,
        expiresAt: status === "expired" ? at - 1n : at + 3600000n,
        acceptedAt: 0n,
        revokedAt: status === "revoked" ? at : 0n,
        status,
      });
    ctx.db.accessClock.insert({ id: 0, now: at });
    ctx.db.accessTimer.insert({
      id: 0n,
      scheduledAt: ScheduleAt.interval(1_000_000n),
    });
    audit(ctx, "acme", "sam", "", "organization.bootstrapped");
    return { seeded: true };
  }
  if (action === "login_failure") {
    const login = text(data, "login");
    const attempt = ctx.db.loginAttempts.login.find(login);
    const failures =
      attempt && attempt.blockedUntil > at ? attempt.failures + 1 : 1;
    const row = { login, failures, blockedUntil: at + 900000n };
    if (attempt) ctx.db.loginAttempts.login.update(row);
    else ctx.db.loginAttempts.insert(row);
    audit(
      ctx,
      "",
      "",
      ctx.db.credentials.login.find(login)?.userId ?? "",
      "authentication.failed",
      "denied",
      argsRef(data),
    );
    return {};
  }
  if (action === "login_success") {
    const userId = text(data, "userId");
    const user = ctx.db.users.id.find(userId);
    if (!user || user.accountStatus !== "active")
      throw new Denied("AUTHENTICATION_FAILED", "Sign-in failed.");
    const sessionHash = validHash(data, "hash");
    const eventId = text(data, "eventId");
    const expiresAt = at + 28800000n;
    ctx.db.sessions.insert({
      hash: sessionHash,
      userId,
      expiresAt,
      createdAt: ctx.timestamp,
    });
    const cred = ctx.db.credentials.userId.find(userId);
    if (cred) ctx.db.loginAttempts.login.delete(cred.login);
    audit(
      ctx,
      "",
      userId,
      userId,
      "authentication.succeeded",
      "success",
      eventId,
    );
    return { user: publicUser(user), expiresAt };
  }
  if (action === "logout") {
    const old = ctx.db.sessions.hash.find(hash);
    for (const grant of ctx.db.connectionGrants.sessionHash.filter(hash))
      ctx.db.connectionGrants.identity.delete(grant.identity);
    ctx.db.sessions.hash.delete(hash);
    if (old)
      audit(ctx, "", old.userId, old.userId, "authentication.logged_out");
    return {};
  }
  if (action === "bind") {
    session(ctx, hash, at);
    const identity = Identity.fromString(text(data, "identity"));
    if (
      !ctx.db.connectionGrants.identity.find(identity) &&
      [...ctx.db.connectionGrants.sessionHash.filter(hash)].length >= 128
    )
      throw new Denied(
        "INVALID_INPUT",
        "Too many open sessions. Sign in again.",
      );
    const row = { identity, sessionHash: hash };
    if (ctx.db.connectionGrants.identity.find(identity))
      ctx.db.connectionGrants.identity.update(row);
    else ctx.db.connectionGrants.insert(row);
    return {};
  }
  if (action === "invite_accept") {
    const actor = session(ctx, hash, at);
    const invite = inviteByHash(ctx, validHash(data, "tokenHash"), at);
    if (
      invite.intendedUserId
        ? invite.intendedUserId !== actor.userId
        : invite.recipientContact !== actor.user.contactValue
    )
      throw new Denied(
        "INVITATION_RECIPIENT",
        "Sign in with the intended responder account.",
      );
    // Invitations cannot be used as a role escalation mechanism for an already-active member.
    if (activeMember(ctx, invite.organizationId, actor.userId, at))
      throw new Denied(
        "ALREADY_MEMBER",
        "This account already has access. Ask an administrator to edit its role.",
      );
    grantMembership(ctx, invite, actor.userId);
    return {
      organizationId: invite.organizationId,
      incidentId: invite.incidentId,
    };
  }
  if (action === "invite_register") {
    const invite = inviteByHash(ctx, validHash(data, "tokenHash"), at);
    if (invite.intendedUserId || !invite.recipientContact.startsWith("+"))
      throw new Denied(
        "INVITATION_RECIPIENT",
        "This invitation requires the existing responder account.",
      );
    const login = text(data, "login").toLowerCase();
    if (
      !/^[a-z0-9][a-z0-9._-]{2,60}$/.test(login) ||
      ctx.db.credentials.login.find(login)
    )
      throw new Denied("INVALID_INPUT", "Choose another account name.");
    const id = text(data, "userId");
    const name = text(data, "name");
    const passwordHash = passwordDigest(data);
    const sessionHash = validHash(data, "hash");
    ctx.db.users.insert({
      id,
      authSubject: `aegis:${id}`,
      name,
      displayName: name,
      contactMethod: "phone",
      contactValue: invite.recipientContact,
      accountStatus: "active",
      createdAt: ctx.timestamp,
    });
    ctx.db.credentials.insert({ login, userId: id, passwordHash });
    ctx.db.sessions.insert({
      hash: sessionHash,
      userId: id,
      expiresAt: at + 28800000n,
      createdAt: ctx.timestamp,
    });
    grantMembership(ctx, invite, id);
    audit(ctx, invite.organizationId, id, id, "authentication.enrolled");
    return {
      organizationId: invite.organizationId,
      incidentId: invite.incidentId,
    };
  }
  if (
    action === "test_restore_memberships" ||
    action === "test_remove_incident"
  ) {
    if (ctx.env.AEGIS_TEST_MODE !== "true")
      throw new Denied("ACCESS_DENIED", "Test fixtures are disabled.");
    if (action === "test_restore_memberships") {
      const defaults: Record<string, string> = {
        sam: "administrator",
        maya: "commander",
        alex: "analyst",
        priya: "legal",
        jordan: "operations",
        taylor: "analyst",
      };
      for (const [userId, role] of Object.entries(defaults)) {
        const member = ctx.db.memberships.id.find(memberId("acme", userId));
        if (member)
          ctx.db.memberships.id.update({
            ...member,
            role,
            status: userId === "taylor" ? "pending" : "active",
            expiresAt: userId === "taylor" ? at + TEMPORARY_MEMBERSHIP_MS : 0n,
            updatedAt: ctx.timestamp,
          });
        const incident = ctx.db.incidentMemberships.id.find(
          incidentKey("acme", "IR-2041", userId),
        );
        if (incident)
          ctx.db.incidentMemberships.id.update({
            ...incident,
            membershipStatus: userId === "taylor" ? "pending" : "active",
          });
      }
    } else {
      const incident = ctx.db.incidentMemberships.id.find(
        incidentKey("acme", "IR-2041", text(data, "userId")),
      );
      if (incident)
        ctx.db.incidentMemberships.id.update({
          ...incident,
          membershipStatus: "revoked",
        });
    }
    return {};
  }
  if (
    action === "test_expire_invitation" ||
    action === "test_expire_session" ||
    action === "test_expire_membership"
  ) {
    if (ctx.env.AEGIS_TEST_MODE !== "true")
      throw new Denied("ACCESS_DENIED", "Test fixtures are disabled.");
    if (action === "test_expire_invitation") {
      const row = ctx.db.invitations.id.find(text(data, "id"));
      if (row) ctx.db.invitations.id.update({ ...row, expiresAt: at - 1n });
    }
    if (action === "test_expire_session") {
      const row = ctx.db.sessions.hash.find(hash);
      if (row) ctx.db.sessions.hash.update({ ...row, expiresAt: at - 1n });
    }
    if (action === "test_expire_membership") {
      const row = ctx.db.memberships.id.find(text(data, "id"));
      if (row) ctx.db.memberships.id.update({ ...row, expiresAt: at - 1n });
    }
    return {};
  }
  const organizationId = text(data, "organizationId");
  const incidentId = typeof data.incidentId === "string" ? data.incidentId : "";
  if (action === "invite_create") {
    const { actor } = authorize(
      ctx,
      hash,
      organizationId,
      incidentId,
      "members:invite",
      at,
    );
    if (
      !incidentId ||
      !ctx.db.incidentStubs.id.find(`${organizationId}:${incidentId}`)
    )
      throw new Denied("INVALID_INPUT", "Select an available incident.");
    const role = validRole(data);
    const id = text(data, "id");
    const tokenHash = validHash(data, "tokenHash");
    const intendedUserId = typeof data.userId === "string" ? data.userId : "";
    const recipient = intendedUserId
      ? ctx.db.users.id.find(intendedUserId)?.contactValue
      : text(data, "phone");
    if (!recipient || (!intendedUserId && !/^\+[1-9]\d{7,14}$/.test(recipient)))
      throw new Denied(
        "INVALID_INPUT",
        "Choose a responder or enter an E.164 phone number.",
      );
    if (!intendedUserId && data.contactVerified !== true)
      throw new Denied(
        "INVALID_INPUT",
        "Confirm independent verification of the phone number.",
      );
    if (intendedUserId && activeMember(ctx, organizationId, intendedUserId, at))
      throw new Denied(
        "ALREADY_MEMBER",
        "This responder already has access. Edit their role instead.",
      );
    const replace =
      typeof data.replaceId === "string"
        ? ctx.db.invitations.id.find(data.replaceId)
        : undefined;
    if (
      data.replaceId &&
      (!replace ||
        replace.organizationId !== organizationId ||
        replace.status === "accepted" ||
        replace.recipientContact !== recipient ||
        replace.incidentId !== incidentId)
    )
      throw new Denied("INVALID_INPUT", "This invitation cannot be replaced.");
    if (replace)
      ctx.db.invitations.id.update({
        ...replace,
        status: "revoked",
        revokedAt: at,
      });
    ctx.db.invitations.insert({
      id,
      organizationId,
      incidentId,
      intendedRole: role,
      recipientContact: recipient,
      intendedUserId,
      tokenHash,
      createdBy: actor.userId,
      createdAt: ctx.timestamp,
      expiresAt: at + 3600000n,
      acceptedAt: 0n,
      revokedAt: 0n,
      status: "pending",
    });
    audit(
      ctx,
      organizationId,
      actor.userId,
      intendedUserId,
      replace ? "invitation.resent" : "invitation.created",
      "success",
      id,
    );
    return { id, expiresAt: at + 3600000n };
  }
  if (action === "invite_revoke") {
    const { actor } = authorize(
      ctx,
      hash,
      organizationId,
      "",
      "members:invite",
      at,
    );
    const invite = ctx.db.invitations.id.find(text(data, "id"));
    if (
      !invite ||
      invite.organizationId !== organizationId ||
      invite.status !== "pending"
    )
      throw new Denied(
        "INVALID_INPUT",
        "This pending invitation is unavailable.",
      );
    ctx.db.invitations.id.update({
      ...invite,
      status: "revoked",
      revokedAt: at,
    });
    audit(
      ctx,
      organizationId,
      actor.userId,
      invite.intendedUserId,
      "invitation.revoked",
      "success",
      invite.id,
    );
    return {};
  }
  if (action === "member_role" || action === "member_revoke") {
    const { actor } = authorize(
      ctx,
      hash,
      organizationId,
      "",
      action === "member_role" ? "members:edit" : "members:revoke",
      at,
    );
    const userId = text(data, "userId");
    const member = ctx.db.memberships.id.find(memberId(organizationId, userId));
    if (!member)
      throw new Denied("INVALID_INPUT", "The member is unavailable.");
    const role = action === "member_role" ? validRole(data) : member.role;
    if (
      member.role === "administrator" &&
      (action === "member_revoke" || role !== "administrator")
    ) {
      const remaining = [
        ...ctx.db.memberships.organizationId.filter(organizationId),
      ].filter(
        (m) =>
          m.userId !== userId &&
          m.role === "administrator" &&
          m.status === "active" &&
          (m.expiresAt === 0n || m.expiresAt > at),
      );
      if (!remaining.length)
        throw new Denied(
          "LAST_ADMIN",
          "Keep at least one active administrator.",
        );
    }
    ctx.db.memberships.id.update({
      ...member,
      role,
      status: action === "member_revoke" ? "revoked" : member.status,
      updatedAt: ctx.timestamp,
    });
    audit(
      ctx,
      organizationId,
      actor.userId,
      userId,
      action === "member_role"
        ? "membership.role_changed"
        : "membership.revoked",
      "success",
      action === "member_role" ? `${member.role} → ${role}` : "",
    );
    return {};
  }
  throw new Denied("INVALID_INPUT", "Unknown operation.");
}
function argsRef(data: Record<string, unknown>) {
  return typeof data.eventId === "string" ? data.eventId.slice(0, 100) : "";
}

export const take_command_result = db.procedure(
  { requestId: t.string() },
  t.string(),
  (ctx, { requestId }) =>
    ctx.withTx((tx) => {
      gateway(tx);
      const row = tx.db.commandResults.id.find(requestId);
      if (!row)
        return serialize({
          ok: false,
          code: "UNAVAILABLE",
          error: "The operation result is unavailable.",
        });
      tx.db.commandResults.id.delete(requestId);
      return row.result;
    }),
);
export const lookup_credentials = db.procedure(
  { login: t.string() },
  t.string(),
  (ctx, { login }) =>
    ctx.withTx((tx) => {
      gateway(tx);
      const attempt = tx.db.loginAttempts.login.find(login);
      if (attempt && attempt.failures >= 5 && attempt.blockedUntil > now(tx))
        return serialize({ blocked: true });
      const credential = tx.db.credentials.login.find(login);
      const user = credential && tx.db.users.id.find(credential.userId);
      return credential && user?.accountStatus === "active"
        ? serialize({ userId: user.id, passwordHash: credential.passwordHash })
        : "{}";
    }),
);
export const access_snapshot = db.procedure(
  {
    sessionHash: t.string(),
    organizationId: t.string(),
    incidentId: t.string(),
    permission: t.string(),
  },
  t.string(),
  (ctx, args) =>
    ctx.withTx((tx) => {
      gateway(tx);
      try {
        const actor = session(tx, args.sessionHash, now(tx));
        if (args.organizationId)
          authorize(
            tx,
            args.sessionHash,
            args.organizationId,
            args.incidentId,
            args.permission as Permission,
            now(tx),
          );
        const access = [...tx.db.memberships.userId.filter(actor.userId)]
          .filter((m) =>
            activeMember(tx, m.organizationId, actor.userId, now(tx)),
          )
          .map((m) => ({
            organizationId: m.organizationId,
            organizationName: tx.db.organizations.id.find(m.organizationId)!
              .name,
            role: m.role,
            permissions: isRole(m.role) ? matrix[m.role] : [],
            responders:
              isRole(m.role) && matrix[m.role].includes("incident:create")
                ? [...tx.db.memberships.organizationId.filter(m.organizationId)]
                    .filter((r) =>
                      activeMember(tx, m.organizationId, r.userId, now(tx)),
                    )
                    .map((r) => ({
                      userId: r.userId,
                      name:
                        tx.db.users.id.find(r.userId)?.displayName ?? r.userId,
                      role: r.role,
                    }))
                : [],
            incidents: incidentAccessRows(
              tx,
              m.organizationId,
              actor.userId,
              m.role,
            ).map((i) => ({
              id: i.incidentId,
              severity:
                tx.db.incidents.id.find(`${i.organizationId}:${i.incidentId}`)
                  ?.severity ?? "",
              status:
                tx.db.incidents.id.find(`${i.organizationId}:${i.incidentId}`)
                  ?.status ?? "",
              title:
                tx.db.incidents.id.find(`${i.organizationId}:${i.incidentId}`)
                  ?.title ??
                tx.db.incidentStubs.id.find(
                  `${i.organizationId}:${i.incidentId}`,
                )?.title ??
                "",
            })),
          }));
        return serialize({
          ok: true,
          data: { user: publicUser(actor.user), access },
        });
      } catch (error) {
        if (!(error instanceof Denied)) throw error;
        audit(
          tx,
          args.organizationId,
          tx.db.sessions.hash.find(args.sessionHash)?.userId ?? "",
          "",
          "access.rejected",
          "denied",
          error.code,
        );
        return serialize({ ok: false, code: error.code, error: error.message });
      }
    }),
);
export const invitation_preview = db.procedure(
  { tokenHash: t.string() },
  t.string(),
  (ctx, { tokenHash }) =>
    ctx.withTx((tx) => {
      gateway(tx);
      const invite = tx.db.invitations.tokenHash.find(tokenHash);
      if (!invite) return serialize({ status: "invalid" });
      return serialize({
        status:
          invite.status === "pending" && invite.expiresAt <= now(tx)
            ? "expired"
            : invite.status,
        organizationName:
          tx.db.organizations.id.find(invite.organizationId)?.name ?? "",
        incidentId: invite.incidentId,
        role: invite.intendedRole,
        existingAccount: !!invite.intendedUserId,
        recipient: invite.intendedUserId
          ? tx.db.users.id.find(invite.intendedUserId)?.displayName
          : `•••• ${invite.recipientContact.slice(-4)}`,
      });
    }),
);

function browserSession(ctx: ReadCtx) {
  const grant = ctx.db.connectionGrants.identity.find(ctx.sender);
  if (!grant) return undefined;
  try {
    return session(
      ctx,
      grant.sessionHash,
      ctx.db.accessClock.id.find(0)?.now ?? 0n,
    );
  } catch {
    return undefined;
  }
}
function incidentAccessRows(
  ctx: Reader,
  org: string,
  userId: string,
  role: string,
) {
  if (role === "administrator")
    return [...ctx.db.incidentStubs.organizationId.filter(org)].map(
      (incident) => ({
        id: incidentKey(org, incident.id.slice(org.length + 1), userId),
        organizationId: org,
        incidentId: incident.id.slice(org.length + 1),
        membershipStatus: "active",
      }),
    );
  return [...ctx.db.incidentMemberships.userId.filter(userId)].filter(
    (incident) =>
      incident.organizationId === org && incident.membershipStatus === "active",
  );
}
function browserAccess(ctx: ReadCtx) {
  const actor = browserSession(ctx);
  if (!actor) return [];
  const at = ctx.db.accessClock.id.find(0)?.now ?? 0n;
  return [...ctx.db.memberships.userId.filter(actor.userId)].flatMap(
    (membership) => {
      const m = activeMember(ctx, membership.organizationId, actor.userId, at);
      if (!m || !isRole(m.role)) return [];
      const permissions = JSON.stringify(matrix[m.role]);
      return incidentAccessRows(
        ctx,
        m.organizationId,
        actor.userId,
        m.role,
      ).map((i) => ({
        id: i.id,
        userId: actor.userId,
        userName: actor.user.displayName,
        organizationId: i.organizationId,
        organizationName: ctx.db.organizations.id.find(i.organizationId)!.name,
        incidentId: i.incidentId,
        role: m.role,
        permissions,
      }));
    },
  );
}
const accessRow = t.object("VisibleAccess", {
  id: t.string(),
  userId: t.string(),
  userName: t.string(),
  organizationId: t.string(),
  organizationName: t.string(),
  incidentId: t.string(),
  role: t.string(),
  permissions: t.string(),
});
export const my_access = db.view({ public: true }, t.array(accessRow), (ctx) =>
  browserAccess(ctx),
);
const memberRow = t.object("VisibleMember", {
  id: t.string(),
  userId: t.string(),
  name: t.string(),
  organizationId: t.string(),
  role: t.string(),
  status: t.string(),
  expiresAt: t.u64(),
  incidentId: t.string(),
  contact: t.string(),
});
export const visible_members = db.view(
  { public: true },
  t.array(memberRow),
  (ctx) => {
    return browserAccess(ctx).flatMap((access) =>
      [
        ...ctx.db.memberships.organizationId.filter(access.organizationId),
      ].flatMap((m) => {
        const user = ctx.db.users.id.find(m.userId);
        const association = ctx.db.incidentMemberships.id.find(
          incidentKey(m.organizationId, access.incidentId, m.userId),
        );
        const admin =
          isRole(access.role) && matrix[access.role].includes("members:edit");
        if (
          !user ||
          (!admin &&
            (m.status !== "active" ||
              (m.role !== "administrator" &&
                association?.membershipStatus !== "active")))
        )
          return [];
        return [
          {
            id: `${access.id}:${m.id}`,
            userId: m.userId,
            name: user.displayName,
            organizationId: m.organizationId,
            role: m.role,
            status: m.status,
            expiresAt: m.expiresAt,
            incidentId:
              m.role === "administrator" ||
              association?.membershipStatus === "active"
                ? access.incidentId
                : "",
            contact: admin ? user.contactValue : "",
          },
        ];
      }),
    );
  },
);
const invitationRow = t.object("VisibleInvitation", {
  id: t.string(),
  organizationId: t.string(),
  incidentId: t.string(),
  intendedRole: t.string(),
  recipientContact: t.string(),
  intendedUserId: t.string(),
  status: t.string(),
  expiresAt: t.u64(),
});
export const visible_invitations = db.view(
  { public: true },
  t.array(invitationRow),
  (ctx) =>
    browserAccess(ctx)
      .filter(
        (a) => isRole(a.role) && matrix[a.role].includes("members:invite"),
      )
      .flatMap((a) =>
        [...ctx.db.invitations.organizationId.filter(a.organizationId)].map(
          (i) => ({
            id: i.id,
            organizationId: i.organizationId,
            incidentId: i.incidentId,
            intendedRole: i.intendedRole,
            recipientContact: i.recipientContact,
            intendedUserId: i.intendedUserId,
            status:
              i.status === "pending" &&
              i.expiresAt <= (ctx.db.accessClock.id.find(0)?.now ?? 0n)
                ? "expired"
                : i.status,
            expiresAt: i.expiresAt,
          }),
        ),
      ),
);
const auditRow = t.object("VisibleAuditEvent", {
  id: t.u64(),
  organizationId: t.string(),
  actorUserId: t.string(),
  targetUserId: t.string(),
  action: t.string(),
  timestamp: t.timestamp(),
  outcome: t.string(),
  metadata: t.string(),
});
export const visible_audit = db.view(
  { public: true },
  t.array(auditRow),
  (ctx) =>
    browserAccess(ctx)
      .filter(
        (a) => isRole(a.role) && matrix[a.role].includes("organization:manage"),
      )
      .flatMap((a) =>
        [
          ...ctx.db.accessAuditEvents.organizationId.filter(a.organizationId),
        ].slice(-40),
      ),
);
export const my_session = db.view(
  { public: true },
  t.array(t.object("VisibleSession", { userId: t.string(), name: t.string() })),
  (ctx) => {
    const actor = browserSession(ctx);
    return actor
      ? [{ userId: actor.userId, name: actor.user.displayName }]
      : [];
  },
);

export const expire_access = db.reducer(
  { name: "expire_access", onSchedule: accessTimer },
  { timer: accessTimer.rowType },
  (ctx) => {
    if (!ctx.senderAuth.isInternal)
      throw new SenderError("Internal scheduler only.");
    const at = now(ctx);
    ctx.db.accessClock.id.update({ id: 0, now: at });
    for (const row of ctx.db.sessions.iter())
      if (row.expiresAt <= at) {
        for (const grant of ctx.db.connectionGrants.sessionHash.filter(
          row.hash,
        ))
          ctx.db.connectionGrants.identity.delete(grant.identity);
        ctx.db.sessions.hash.delete(row.hash);
        audit(ctx, "", row.userId, row.userId, "authentication.expired");
      }
    for (const row of ctx.db.memberships.iter())
      if (
        row.status === "active" &&
        row.expiresAt !== 0n &&
        row.expiresAt <= at
      ) {
        ctx.db.memberships.id.update({
          ...row,
          status: "expired",
          updatedAt: ctx.timestamp,
        });
        audit(ctx, row.organizationId, "", row.userId, "membership.expired");
      }
    processPages(ctx);
    processRecovery(ctx);
    for (const row of ctx.db.commandResults.iter())
      if (row.createdAt.microsSinceUnixEpoch / 1000n + 60000n < at)
        ctx.db.commandResults.id.delete(row.id);
  },
);
export const write_health_check = db.reducer(
  { message: t.string() },
  (ctx, { message }) => {
    const value = message.trim();
    if (!value || value.length > 160)
      throw new SenderError("Message must contain 1–160 characters.");
    const rows = [...ctx.db.healthCheck.iter()].sort((a, b) =>
      a.id < b.id ? -1 : 1,
    );
    for (const row of rows.slice(0, Math.max(0, rows.length - 49)))
      ctx.db.healthCheck.id.delete(row.id);
    ctx.db.healthCheck.insert({
      id: 0n,
      message: value,
      created_at: ctx.timestamp,
    });
  },
);

const incidentDataRow = t.object("IncidentDataRow", {
  id: t.string(),
  kind: t.string(),
  organizationId: t.string(),
  incidentId: t.string(),
  body: t.string(),
});
export const visible_incident_data = db.view(
  { public: true },
  t.array(incidentDataRow),
  (ctx) => {
    const access = browserAccess(ctx);
    return [
      ...incidentProjection(ctx, access),
      ...access
        .filter((a) =>
          (JSON.parse(a.permissions) as string[]).includes("scope:summary"),
        )
        .map((a) => ({
          id: `scopeSummary:${a.id}`,
          kind: "scopeSummary",
          organizationId: a.organizationId,
          incidentId: a.incidentId,
          body: serialize(
            scopeSnapshot(ctx, a.organizationId, a.incidentId).summary,
          ),
        })),
    ];
  },
);
export const evidence_descriptor = db.procedure(
  { sessionHash: t.string(), evidenceId: t.string() },
  t.string(),
  (ctx, args) =>
    ctx.withTx((tx) => {
      gateway(tx);
      try {
        return serialize({
          ok: true,
          data: evidenceDescriptor(
            tx,
            args.sessionHash,
            args.evidenceId,
            {
              authorize,
              activeMember,
              fail: (code, message): never => {
                throw new Denied(code, message);
              },
            },
            now(tx),
          ),
        });
      } catch (error) {
        if (!(error instanceof Denied)) throw error;
        return serialize({ ok: false, code: error.code, error: error.message });
      }
    }),
);

export const visible_scope_data = db.view(
  { public: true },
  t.array(incidentDataRow),
  (ctx) => scopeProjection(ctx, browserAccess(ctx)),
);
export const scope_read = db.procedure(
  { sessionHash: t.string(), payload: t.string() },
  t.string(),
  (ctx, args) =>
    ctx.withTx((tx) => {
      gateway(tx);
      try {
        if (args.payload.length > 10000)
          throw new Denied("INVALID_INPUT", "Query too large.");
        const data = JSON.parse(args.payload) as Record<string, unknown>;
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Denied("INVALID_INPUT", "Invalid scope query.");
        return serialize({
          ok: true,
          data: scopeRead(
            tx,
            args.sessionHash,
            data,
            {
              authorize,
              activeMember,
              fail: (code, message): never => {
                throw new Denied(code, message);
              },
            },
            now(tx),
          ),
        });
      } catch (error) {
        if (error instanceof SyntaxError)
          return serialize({
            ok: false,
            code: "INVALID_INPUT",
            error: "Invalid scope query.",
          });
        if (!(error instanceof Denied)) throw error;
        return serialize({ ok: false, code: error.code, error: error.message });
      }
    }),
);

export const visible_coordination_data = db.view(
  { public: true },
  t.array(incidentDataRow),
  (ctx) => coordinationProjection(ctx, browserAccess(ctx)),
);

export const visible_recovery_data = db.view(
  { public: true },
  t.array(incidentDataRow),
  (ctx) => recoveryProjection(ctx, browserAccess(ctx)),
);
export const recovery_read = db.procedure(
  { sessionHash: t.string(), payload: t.string() },
  t.string(),
  (ctx, args) =>
    ctx.withTx((tx) => {
      gateway(tx);
      try {
        if (args.payload.length > 12000)
          throw new Denied("INVALID_INPUT", "Query too large.");
        const payload = JSON.parse(args.payload) as Record<string, unknown>;
        if (!payload || typeof payload !== "object" || Array.isArray(payload))
          throw new Denied("INVALID_INPUT", "Invalid recovery query.");
        return serialize({
          ok: true,
          data: recoveryRead(
            tx,
            args.sessionHash,
            payload,
            {
              authorize,
              activeMember,
              fail: (code, message): never => {
                throw new Denied(code, message);
              },
            },
            now(tx),
          ),
        });
      } catch (error) {
        if (error instanceof SyntaxError)
          return serialize({
            ok: false,
            code: "INVALID_INPUT",
            error: "Invalid recovery query.",
          });
        if (!(error instanceof Denied)) throw error;
        return serialize({ ok: false, code: error.code, error: error.message });
      }
    }),
);
