"use client";
import { TeamWorkspace } from "./team-workspace";
import { LiveOverview, LiveTimeline } from "./live-incident";
import { ScopeWorkspace } from "./scope-workspace";
import { RecoveryWorkspace } from "./recovery-workspace";
import type { Section } from "./workspace-shell";
export function IncidentPage({ section }: { section: Section }) {
  if (section === "scope") return <ScopeWorkspace />;
  if (section === "operations") return <RecoveryWorkspace />;
  if (section === "team") return <TeamWorkspace />;
  if (section === "timeline") return <LiveTimeline />;
  return <LiveOverview />;
}
