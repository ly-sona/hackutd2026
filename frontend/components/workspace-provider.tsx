"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  SpacetimeDBProvider,
  useSpacetimeDB,
  useTable,
} from "spacetimedb/react";
import { DbConnection, tables } from "@/src/module_bindings";
import { spacetimeConfig } from "@/lib/spacetime-config";
import { api } from "@/lib/api";
import { AccessState } from "./access-state";
import { Brand } from "./brand";

type Access = {
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  incidentId: string;
  role: string;
  permissions: string;
};
const AccessContext = createContext<Access | null>(null);
export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("Workspace access is required.");
  return {
    ...value,
    can: (permission: string) =>
      (JSON.parse(value.permissions) as string[]).includes(permission),
  };
}
export function WorkspaceProvider({
  organizationId,
  incidentId,
  expectedUserId,
  children,
}: {
  organizationId: string;
  incidentId: string;
  expectedUserId: string;
  children: React.ReactNode;
}) {
  const builder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(spacetimeConfig.endpoint)
        .withDatabaseName(spacetimeConfig.database),
    [],
  );
  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <Boundary
        organizationId={organizationId}
        incidentId={incidentId}
        expectedUserId={expectedUserId}
      >
        {children}
      </Boundary>
    </SpacetimeDBProvider>
  );
}
function Boundary({
  organizationId,
  incidentId,
  expectedUserId,
  children,
}: {
  organizationId: string;
  incidentId: string;
  expectedUserId: string;
  children: React.ReactNode;
}) {
  const connection = useSpacetimeDB();
  const [access, ready] = useTable(tables.myAccess);
  const [sessions, sessionReady] = useTable(tables.mySession);
  const [binding, setBinding] = useState<{
    identity: string;
    error?: string;
  }>();
  const identity = connection.identity?.toHexString();
  // React's SDK provider can reuse a pooled connection across route transitions.
  // Bind from observed identity state, rather than relying on a new onConnect callback.
  useEffect(() => {
    if (!connection.isActive || !identity) return;
    let cancelled = false;
    api("connection/bind", { identity })
      .then(() => {
        if (!cancelled) setBinding({ identity });
      })
      .catch((error) => {
        if (!cancelled) setBinding({ identity, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [connection.isActive, identity]);
  if (binding?.error)
    return <AccessState title="Access unavailable" message={binding.error} />;
  if (
    !connection.isActive ||
    binding?.identity !== identity ||
    !identity ||
    !ready ||
    !sessionReady
  )
    return (
      <main className="min-h-screen px-6 py-5">
        <Brand />
        <div
          role="status"
          className="mx-auto max-w-lg py-32 text-sm text-muted-foreground"
        >
          {connection.connectionError
            ? "Connection interrupted. Reconnecting securely…"
            : "Verifying workspace access…"}
        </div>
      </main>
    );
  if (!sessions.length)
    return (
      <AccessState
        title="Session expired"
        message="Your session is no longer active. Sign in again to continue."
      />
    );
  const current = access.find(
    (a) =>
      a.organizationId === organizationId &&
      a.incidentId === incidentId &&
      a.userId === expectedUserId,
  );
  if (!current)
    return (
      <AccessState
        title="Access revoked"
        message="You no longer have active membership in this workspace. Contact an AEGIS administrator."
      />
    );
  return (
    <AccessContext.Provider value={current}>{children}</AccessContext.Provider>
  );
}
