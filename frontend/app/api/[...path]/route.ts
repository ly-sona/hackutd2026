import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  AccessError,
  command,
  snapshot,
  withGateway,
} from "@/lib/server/gateway";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
  newToken,
} from "@/lib/server/password";
import {
  cookieOptions,
  sessionCookie,
  sessionHash,
} from "@/lib/server/session";
import { invitationDelivery } from "@/lib/server/delivery";
import { safeReturnPath } from "@/lib/auth-navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(100);
const role = z.enum([
  "administrator",
  "commander",
  "analyst",
  "legal",
  "operations",
]);
const token = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
const dummyPassword = hashPassword(newToken());
const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowed = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  );
  if (origin === allowed.origin) return;
  if (process.env.NODE_ENV !== "production" && origin) {
    const actual = new URL(origin);
    if (
      ["localhost", "127.0.0.1"].includes(actual.hostname) &&
      ["localhost", "127.0.0.1"].includes(allowed.hostname) &&
      actual.port === allowed.port &&
      actual.protocol === allowed.protocol
    )
      return;
  }
  throw new AccessError(
    "ACCESS_DENIED",
    "The request origin could not be verified.",
  );
}
async function dispatch(request: NextRequest, path: string, mutation: boolean) {
  if (mutation) sameOrigin(request);
  const hash = await sessionHash();
  if (!mutation && path === "session") return response(await snapshot(hash));
  if (!mutation && path === "workspace") {
    const org = id.parse(request.nextUrl.searchParams.get("organizationId"));
    const incident = id.parse(request.nextUrl.searchParams.get("incidentId"));
    const permission = z
      .string()
      .max(100)
      .parse(request.nextUrl.searchParams.get("permission") ?? "incident:view");
    return response(await snapshot(hash, org, incident, permission));
  }
  if (!mutation) return response({ error: "Not found." }, 404);
  const raw: unknown = await request.json();
  if (path === "auth/login") {
    const input = z
      .object({
        login: z.string().min(1).max(100),
        password: z.string().min(1).max(128),
        returnTo: z.string().max(1000).optional(),
      })
      .strict()
      .parse(raw);
    const login = input.login.trim().toLowerCase();
    const credential = await withGateway(
      async (conn) =>
        JSON.parse(await conn.procedures.lookupCredentials({ login })) as {
          userId?: string;
          passwordHash?: string;
          blocked?: boolean;
        },
    );
    const valid = await verifyPassword(
      input.password,
      credential.passwordHash ?? (await dummyPassword),
    );
    if (!valid || !credential.userId || credential.blocked) {
      await command("login_failure", "", { login, eventId: randomUUID() });
      return response(
        {
          error:
            "Sign-in failed. Check your AEGIS account details or try again later.",
        },
        401,
      );
    }
    const secret = newToken();
    await command("login_success", "", {
      userId: credential.userId,
      hash: tokenHash(secret),
      eventId: randomUUID(),
    });
    if (hash) await command("logout", hash, {});
    (await cookies()).set(sessionCookie, secret, cookieOptions);
    return response({ redirect: safeReturnPath(input.returnTo) });
  }
  if (path === "auth/logout") {
    if (hash) await command("logout", hash, {});
    (await cookies()).delete(sessionCookie);
    return response({ ok: true });
  }
  if (path === "connection/bind") {
    const input = z
      .object({ identity: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(raw);
    await command("bind", hash, input);
    return response({ ok: true });
  }
  if (path === "invitations") {
    const input = z
      .object({
        organizationId: id,
        incidentId: id,
        role,
        userId: id.optional(),
        phone: z.string().max(20).optional(),
        contactVerified: z.boolean().optional(),
        replaceId: id.optional(),
      })
      .strict()
      .parse(raw);
    const secret = newToken();
    const result = await command<{ id: string; expiresAt: string }>(
      "invite_create",
      hash,
      { ...input, id: randomUUID(), tokenHash: tokenHash(secret) },
    );
    const link = new URL(
      `/invite/${secret}`,
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    ).toString();
    const delivery = await invitationDelivery.deliver({
      recipient: input.phone ?? input.userId ?? "",
      link,
    });
    return response({ ...result, link, delivery }, 201);
  }
  if (path === "invitations/revoke") {
    const input = z.object({ organizationId: id, id }).strict().parse(raw);
    await command("invite_revoke", hash, input);
    return response({ ok: true });
  }
  if (path === "invitations/accept") {
    const input = z.object({ token }).strict().parse(raw);
    return response(
      await command("invite_accept", hash, {
        tokenHash: tokenHash(input.token),
      }),
    );
  }
  if (path === "invitations/register") {
    const input = z
      .object({
        token,
        name: z.string().trim().min(2).max(100),
        login: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,60}$/),
        password: z.string().min(12).max(128),
      })
      .strict()
      .parse(raw);
    const secret = newToken();
    const result = await command("invite_register", "", {
      tokenHash: tokenHash(input.token),
      userId: randomUUID(),
      name: input.name,
      login: input.login,
      passwordHash: await hashPassword(input.password),
      hash: tokenHash(secret),
    });
    (await cookies()).set(sessionCookie, secret, cookieOptions);
    return response(result, 201);
  }
  if (path === "members/role") {
    const input = z
      .object({ organizationId: id, userId: id, role })
      .strict()
      .parse(raw);
    await command("member_role", hash, input);
    return response({ ok: true });
  }
  if (path === "members/revoke") {
    const input = z
      .object({ organizationId: id, userId: id })
      .strict()
      .parse(raw);
    await command("member_revoke", hash, input);
    return response({ ok: true });
  }
  return response({ error: "Not found." }, 404);
}
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  mutation: boolean,
) {
  try {
    if (
      request.headers.get("content-length") &&
      Number(request.headers.get("content-length")) > 8192
    )
      return response({ error: "Request is too large." }, 413);
    return await dispatch(
      request,
      (await context.params).path.join("/"),
      mutation,
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return response(
        {
          code: "INVALID_INPUT",
          error: "Check the form fields and try again.",
        },
        400,
      );
    if (error instanceof AccessError) {
      const status =
        error.code === "SESSION_EXPIRED"
          ? 401
          : error.code === "UNAVAILABLE"
            ? 503
            : [
                  "ACCESS_DENIED",
                  "ACCESS_REVOKED",
                  "INVITATION_RECIPIENT",
                  "LAST_ADMIN",
                ].includes(error.code)
              ? 403
              : 400;
      return response({ code: error.code, error: error.message }, status);
    }
    // Do not log payloads, cookies, tokens or raw database exceptions.
    return response(
      {
        code: "UNAVAILABLE",
        error:
          "The access service is temporarily unavailable. Please try again.",
      },
      503,
    );
  }
}
export const GET = (
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) => handle(request, context, false);
export const POST = (
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) => handle(request, context, true);
