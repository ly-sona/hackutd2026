"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp, X } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "./ui/button";

const guides: Record<string, { title: string; steps: [string, string][] }> = {
  organizations: { title: "Your organizations", steps: [
    ["Choose an incident", "Open an incident under your organization to enter its response workspace."],
    ["Start a response", "If your role permits it, use New incident to create a workspace and assign responders."],
    ["Manage your account", "Open your account menu to review your profile or sign out."],
  ] },
  overview: { title: "Overview", steps: [
    ["Get oriented", "Review the incident status, summary and key findings. Use the incident selector at the top to change incidents."],
    ["Follow the evidence", "Open a finding for its supporting evidence. Investigation collects source snapshots and presents proposals for human review."],
    ["Capture and share", "Use the available actions to update incident documentation or generate a report. Scope, Operations, Team and Timeline provide the detailed workspaces."],
  ] },
  scope: { title: "Scope", steps: [
    ["Explore the incident", "Select an entity in the graph or list to inspect its relationships and incident context."],
    ["Inspect the details", "Review linked evidence and records before assessing compromise or business impact."],
    ["Record an assessment", "Use the available assessment controls to record your conclusion and justification. Unknown or unchanged data does not establish safety."],
  ] },
  operations: { title: "Operations", steps: [
    ["Choose a request", "Select a request on the left to see its purpose, status and required reviewers."],
    ["Review before deciding", "Expand the rationale, evidence and approval history. Eligible reviewers can approve or reject; requesting an action does not approve it."],
    ["Track recovery", "Expand Recovery tools and Recovery progress for available actions and results. Recovery and fallback access are simulated and remain subject to approval and access limits."],
  ] },
  team: { title: "Team", steps: [
    ["Find your responders", "Review the incident team and each responder’s role. Available management actions depend on your permissions."],
    ["Coordinate a response", "Select a conversation to read and send messages. Keep sensitive discussions in the appropriate private conversation."],
    ["Track follow-up", "Use incident tasks to assign and track work, and paging controls when a responder’s attention is needed."],
  ] },
  timeline: { title: "Timeline", steps: [
    ["Review the sequence", "Read the incident chronology and use the available filters to find relevant events."],
    ["Check the source", "Open linked findings or evidence for context. An event’s recorded time and the time it occurred can differ."],
    ["Document developments", "Use the available event controls to record new developments and their supporting evidence."],
  ] },
  investigation: { title: "Investigation", steps: [
    ["Review source coverage", "Inspect the available sources and snapshot history. Collection uses simulated exports; missing or unchanged entries do not prove safety."],
    ["Inspect findings and evidence", "Switch between Findings, Evidence and Activity to follow observations back to their source records."],
    ["Make a human decision", "Review proposals and their citations before accepting or rejecting with a reason. Acceptance needs current permissions; recovery still requires its own approvals."],
  ] },
  members: { title: "Members", steps: [
    ["Review access", "Find organization members and inspect their roles, membership status and expiration."],
    ["Manage membership", "Use the available member controls to adjust access. Role changes and revocation affect what the member can do."],
  ] },
  invitations: { title: "Invitations", steps: [
    ["Invite a responder", "Create an invitation with the intended role and access duration using the available form."],
    ["Track pending access", "Review pending invitations and their expiration. Share invitation links only with the intended recipient; revoke invitations that are no longer needed."],
  ] },
  login: { title: "Sign in", steps: [
    ["Use your AEGIS account", "Enter your independent AEGIS credentials to sign in. Corporate sign-in is not required."],
    ["Joining for the first time?", "Open the invitation link supplied by your administrator. After signing in, choose your organization and incident."],
  ] },
  invite: { title: "Accept an invitation", steps: [
    ["Check your invitation", "Review the organization and access offered by this invitation."],
    ["Join the workspace", "Follow the form to use an existing account or create one. An expired or revoked invitation requires a new link from an administrator."],
  ] },
  development: { title: "Connection diagnostics", steps: [
    ["Check connectivity", "Use the health-check controls to inspect the synthetic database connection. This page contains public diagnostic data, not incident information."],
  ] },
};

export function PageHelp() {
  const pathname = usePathname();
  const page = pathname.startsWith("/invite/") ? "invite" : pathname.split("/").filter(Boolean).at(-1);
  const guide = page ? guides[page] : undefined;
  return guide ? <HelpCard key={pathname} guide={guide} /> : null;
}

function HelpCard({ guide }: { guide: (typeof guides)[string] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [title, description] = guide.steps[step];
  return (
    <Popover.Root open={open} onOpenChange={(value) => { setOpen(value); if (value) setStep(0); }}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="sm" aria-label="Quick page help" className="gap-2 px-2 text-sm text-muted-foreground">
          <CircleHelp aria-hidden="true" /><span className="hidden sm:inline">Quick help</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} collisionPadding={16} aria-label={`${guide.title} walkthrough`} className="z-50 w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{guide.title} · Quick help</p>
            <Popover.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close help"><X aria-hidden="true" /></Button></Popover.Close>
          </div>
          <div aria-live="polite" aria-atomic="true" className="min-h-32">
            <p className="mb-2 text-xs text-muted-foreground">Step {step + 1} of {guide.steps.length}</p>
            <h2 className="mb-2 text-base font-semibold">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="mt-5 flex justify-between gap-3">
            <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
            {step === guide.steps.length - 1
              ? <Popover.Close asChild><Button size="sm">Done</Button></Popover.Close>
              : <Button size="sm" onClick={() => setStep(step + 1)}>Next</Button>}
          </div>
          <Popover.Arrow className="fill-border" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
