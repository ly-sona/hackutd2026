"use client";

import { usePathname } from "next/navigation";
import { sections } from "@/lib/roles";
import { WorkspaceShell } from "./workspace-shell";
import { IncidentPage } from "./incident-pages";
import { ScopeDataProvider } from "./scope-data";

export function IncidentWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = sections.find((item) => pathname.endsWith(`/${item}`));
  if (!section) return children;
  return (
    <ScopeDataProvider>
      <WorkspaceShell section={section}>
        {children}
        <IncidentPage key={section} section={section} />
      </WorkspaceShell>
    </ScopeDataProvider>
  );
}
