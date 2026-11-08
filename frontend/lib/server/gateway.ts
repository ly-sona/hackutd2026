// Node-only trusted service connection. Never import this module from client components.
import { randomUUID } from "node:crypto";
import { DbConnection } from "../../src/module_bindings";

export class AccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; error: string };
export function unwrap<T>(json: string): T {
  const result = JSON.parse(json) as Result<T>;
  if (!result.ok) throw new AccessError(result.code, result.error);
  return result.data;
}
export async function withGateway<T>(
  run: (connection: DbConnection) => Promise<T>,
): Promise<T> {
  const token = process.env.SPACETIMEDB_SERVER_TOKEN;
  if (!token)
    throw new AccessError(
      "UNAVAILABLE",
      "The access service is not configured. Contact the administrator.",
    );
  let connection: DbConnection | undefined;
  try {
    connection = await new Promise<DbConnection>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.disconnect();
        reject(
          new AccessError(
            "UNAVAILABLE",
            "The access service is temporarily unavailable.",
          ),
        );
      }, 10_000);
      const pending = DbConnection.builder()
        .withUri(
          process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? "http://127.0.0.1:3001",
        )
        .withDatabaseName(
          process.env.NEXT_PUBLIC_SPACETIMEDB_DB_NAME ?? "aegis-local",
        )
        .withToken(token)
        .onConnect((conn) => {
          clearTimeout(timer);
          resolve(conn);
        })
        .onConnectError(() => {
          clearTimeout(timer);
          reject(
            new AccessError(
              "UNAVAILABLE",
              "The access service is temporarily unavailable.",
            ),
          );
        })
        .build();
    });
    return await run(connection);
  } finally {
    connection?.disconnect();
  }
}
export async function command<T = Record<string, never>>(
  action: string,
  sessionHash: string,
  payload: object,
): Promise<T> {
  return withGateway(async (conn) => {
    const requestId = randomUUID();
    await conn.reducers.accessCommand({
      requestId,
      sessionHash,
      action,
      payload: JSON.stringify(payload),
    });
    return unwrap<T>(await conn.procedures.takeCommandResult({ requestId }));
  });
}
export interface SessionSnapshot {
  user: { id: string; name: string; contact: string; status: string };
  access: {
    organizationId: string;
    organizationName: string;
    role: string;
    permissions: string[];
    incidents: { id: string; title: string }[];
  }[];
}
export async function snapshot(
  sessionHash: string,
  organizationId = "",
  incidentId = "",
  permission = "organization:view",
) {
  return withGateway(async (conn) =>
    unwrap<SessionSnapshot>(
      await conn.procedures.accessSnapshot({
        sessionHash,
        organizationId,
        incidentId,
        permission,
      }),
    ),
  );
}
