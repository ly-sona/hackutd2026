"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useTable } from "spacetimedb/react";
import {
  UserPlus,
  Search,
  Copy,
  Check,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { tables } from "@/src/module_bindings";
import { useAccess } from "./workspace-provider";
import { roleLabels, incidentBase } from "@/lib/roles";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "./ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Avatar } from "./account-menu";
import { AccessState } from "./access-state";
import { Disclosure } from "./workspace-ui";

type Delivery = {
  id: string;
  expiresAt: string;
  link: string;
  delivery: { mode: string; message: string };
};
type Member = {
  userId: string;
  name: string;
  role: string;
  status: string;
  contact: string;
  incidentId: string;
  expiresAt: bigint;
};
export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`font-normal capitalize ${["active", "accepted"].includes(status) ? "border-emerald-400/20 text-emerald-400" : ["pending", "expired"].includes(status) ? "border-amber-400/20 text-amber-300" : "text-muted-foreground"}`}
    >
      {status}
    </Badge>
  );
}
function RoleOptions() {
  return (
    <>
      {Object.entries(roleLabels).map(([role, label]) => (
        <option key={role} value={role}>
          {label}
        </option>
      ))}
    </>
  );
}
function DeliveryPanel({ result }: { result: Delivery }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 rounded-md border border-amber-400/20 bg-amber-400/[.03] p-4">
      <p className="flex items-center gap-2 text-sm text-amber-300">
        <ShieldCheck size={15} />
        Simulated invitation delivery
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        {result.delivery.message}
      </p>
      <label
        htmlFor="invitation-link"
        className="block text-xs text-muted-foreground"
      >
        One-time activation link
      </label>
      <div className="flex gap-2">
        <Input
          id="invitation-link"
          readOnly
          value={result.link}
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy invitation link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(result.link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Expires {new Date(Number(result.expiresAt)).toLocaleTimeString()}. Keep
        this link private.
      </p>
    </div>
  );
}
export function InviteResponder() {
  const access = useAccess();
  const [members] = useTable(tables.visibleMembers);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("existing");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Delivery>();
  if (!access.can("members:invite")) return null;
  const candidates = uniqueOrganizationMembers(
    members,
    access.organizationId,
    access.incidentId,
  ).filter(
    (m) => m.organizationId === access.organizationId && m.status !== "active",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      setResult(
        await api<Delivery>("invitations", {
          organizationId: access.organizationId,
          incidentId: access.incidentId,
          role: form.get("role"),
          ...(mode === "existing"
            ? { userId: form.get("userId") }
            : {
                phone: form.get("phone"),
                contactVerified: form.get("verified") === "on",
              }),
        }),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Invitation could not be created.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserPlus size={15} />
        Invite responder
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setResult(undefined);
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite responder</DialogTitle>
            <DialogDescription>
              Grant independent access to {access.organizationName} ·{" "}
              {access.incidentId}. Invitations are single-use and valid for one
              hour.
            </DialogDescription>
          </DialogHeader>
          {result ? (
            <>
              <DeliveryPanel result={result} />
              <DialogFooter>
                <Button
                  onClick={() => {
                    setOpen(false);
                    setResult(undefined);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="invite-mode" className="mb-2 block text-sm">
                  Recipient
                </label>
                <select
                  id="invite-mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className={selectClass}
                >
                  <option value="existing">Existing synthetic responder</option>
                  <option value="phone">
                    Independently verified phone number
                  </option>
                </select>
              </div>
              {mode === "existing" ? (
                <div>
                  <label htmlFor="responder" className="mb-2 block text-sm">
                    Responder account
                  </label>
                  <select
                    id="responder"
                    name="userId"
                    required
                    className={selectClass}
                  >
                    {candidates.map((m) => (
                      <option value={m.userId} key={m.userId}>
                        {m.name} — {m.status}
                      </option>
                    ))}
                  </select>
                  {!candidates.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      All seeded responders have access. Use a verified phone
                      number to enroll another account.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="phone" className="mb-2 block text-sm">
                      Phone number
                    </label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="+12145550123"
                      pattern="\+[1-9][0-9]{7,14}"
                      required
                    />
                  </div>
                  <label className="flex items-start gap-3 text-xs leading-5 text-muted-foreground">
                    <input
                      type="checkbox"
                      name="verified"
                      required
                      className="mt-1 accent-white"
                    />
                    I independently verified this number and will share the demo
                    link through a trusted channel.
                  </label>
                </>
              )}
              <div>
                <label htmlFor="invite-role" className="mb-2 block text-sm">
                  Assigned role
                </label>
                <select
                  id="invite-role"
                  name="role"
                  defaultValue="analyst"
                  className={selectClass}
                >
                  <RoleOptions />
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-xs text-muted-foreground">
                    Organization
                  </label>
                  <Input
                    aria-label="Invitation organization"
                    value={access.organizationName}
                    readOnly
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs text-muted-foreground">
                    Incident
                  </label>
                  <Input
                    aria-label="Invitation incident"
                    value={access.incidentId}
                    readOnly
                  />
                </div>
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    pending || (mode === "existing" && !candidates.length)
                  }
                >
                  {pending ? "Creating…" : "Generate invitation"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function MembersPage() {
  const access = useAccess();
  const [rows, ready] = useTable(tables.visibleMembers);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Member>();
  const [role, setRole] = useState("");
  const [revoke, setRevoke] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!access.can("members:edit"))
    return (
      <AccessState message="Only a System Administrator can manage members." />
    );
  const members = uniqueOrganizationMembers(
    rows,
    access.organizationId,
    access.incidentId,
  ).filter(
    (m) =>
      m.organizationId === access.organizationId &&
      (filter === "all" || m.role === filter) &&
      `${m.name} ${m.contact}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function update(action: "role" | "revoke") {
    if (!selected) return;
    setPending(true);
    setError("");
    try {
      await api(`members/${action}`, {
        organizationId: access.organizationId,
        userId: selected.userId,
        ...(action === "role" ? { role } : {}),
      });
      setNotice(
        action === "role"
          ? "Member role updated. Permissions are now enforced across open sessions."
          : "Membership revoked. The responder no longer has workspace access.",
      );
      setSelected(undefined);
      setRevoke(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The update failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Link
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
        href={`${incidentBase(access.organizationId, access.incidentId)}/team`}
      >
        <ArrowLeft size={13} />
        Response team
      </Link>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px]">
            Manage members
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Control who can access {access.organizationName} and their assigned
            responsibilities.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/org/${access.organizationId}/invitations`}>
              Invitations
            </Link>
          </Button>
          <InviteResponder />
        </div>
      </div>
      {notice && (
        <p
          role="status"
          className="mb-5 rounded-md border border-emerald-400/20 p-3 text-sm text-emerald-400"
        >
          {notice}
        </p>
      )}
      <div className="mb-5 flex max-w-xl gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute top-2.5 left-3 text-muted-foreground"
          />
          <Input
            aria-label="Search members"
            placeholder="Search members…"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          aria-label="Filter by role"
          className={`${selectClass} max-w-72`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All roles</option>
          <RoleOptions />
        </select>
      </div>
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Incident</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="text-right pr-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="py-4 pl-5">
                  <div className="flex items-center gap-3">
                    <Avatar name={member.name} small />
                    <div>
                      <p>{member.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {member.contact}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{roleLabels[member.role]}</TableCell>
                <TableCell className="text-muted-foreground">
                  {access.organizationName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.incidentId || "Not assigned"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={member.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.expiresAt !== 0n ? "Temporary" : "Standard"}
                </TableCell>
                <TableCell className="text-right pr-5">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${member.name}`}
                    onClick={() => {
                      setSelected(member);
                      setRole(member.role);
                      setError("");
                    }}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!ready && (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            Loading members…
          </p>
        )}
        {ready && !members.length && (
          <p className="p-6 text-sm text-muted-foreground">
            No members match your search.
          </p>
        )}
      </div>
      <AuditPanel />
      <Dialog
        open={!!selected && !revoke}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Member details</DialogTitle>
            <DialogDescription>
              Changes take effect in all active sessions.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="flex items-center gap-3">
                <Avatar name={selected.name} />
                <div>
                  <p>{selected.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.contact}
                  </p>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {access.organizationName} ·{" "}
                {selected.incidentId || "No incident assignment"}
                {selected.expiresAt !== 0n &&
                  ` · Access expires ${new Date(Number(selected.expiresAt)).toLocaleString()}`}
              </p>
              <label htmlFor="member-role" className="text-sm">
                Assigned role
              </label>
              <select
                id="member-role"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className={selectClass}
              >
                <RoleOptions />
              </select>
              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}
              <DialogFooter className="sm:justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending || selected.status === "revoked"}
                  onClick={() => {
                    setRevoke(true);
                    setError("");
                  }}
                >
                  Revoke access
                </Button>
                <Button
                  type="button"
                  disabled={pending || role === selected.role}
                  onClick={() => update("role")}
                >
                  {pending ? "Updating…" : "Confirm role change"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={revoke} onOpenChange={setRevoke}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke access for {selected?.name}?</DialogTitle>
            <DialogDescription>
              This removes organization access and stops authorized workspace
              updates. It does not delete the account or audit history.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setRevoke(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => update("revoke")}
            >
              {pending ? "Revoking…" : "Confirm revocation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function PendingInvitations() {
  return <InvitationsPage compact />;
}
export function InvitationsPage({
  compact = false,
}: { compact?: boolean } = {}) {
  const access = useAccess();
  const [rows, ready] = useTable(tables.visibleInvitations);
  const [result, setResult] = useState<Delivery>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [revoke, setRevoke] = useState<string>();
  const [replacementId, setReplacementId] = useState<string>();
  if (!access.can("members:invite"))
    return compact ? null : (
      <AccessState message="Your role does not permit invitation management." />
    );
  const invitations = rows.filter(
    (i) =>
      i.organizationId === access.organizationId &&
      (!compact || i.status === "pending"),
  );
  async function replace(id: string) {
    const invite = rows.find(
      (i) => i.organizationId === access.organizationId && i.id === id,
    );
    if (!invite) return;
    setPending(id);
    setError("");
    try {
      setResult(
        await api<Delivery>("invitations", {
          organizationId: access.organizationId,
          incidentId: invite.incidentId,
          role: invite.intendedRole,
          replaceId: invite.id,
          ...(invite.intendedUserId
            ? { userId: invite.intendedUserId }
            : { phone: invite.recipientContact, contactVerified: true }),
        }),
      );
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Replacement failed.");
      return false;
    } finally {
      setPending("");
    }
  }
  async function revokeInvitation() {
    if (!revoke) return;
    setPending(revoke);
    setError("");
    try {
      await api("invitations/revoke", {
        organizationId: access.organizationId,
        id: revoke,
      });
      setRevoke(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Revocation failed.");
    } finally {
      setPending("");
    }
  }
  const invitationActions = (invite: (typeof invitations)[number]) => (
    <>
      {invite.status !== "accepted" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={!!pending}
          onClick={() => {
            setError("");
            setReplacementId(invite.id);
          }}
        >
          Generate replacement
        </Button>
      )}
      {invite.status === "pending" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={!!pending}
          onClick={() => setRevoke(invite.id)}
        >
          Revoke
        </Button>
      )}
    </>
  );
  return (
    <>
      {compact ? (
        <Disclosure
          title={`Invitations pending (${ready ? invitations.length : "…"})`}
          className="mt-5"
        >
          <div className="space-y-4">
            {invitations.map((invite) => (
              <article
                key={invite.id}
                data-testid="pending-invitation"
                className="border-b border-border pb-4 last:border-0"
              >
                <p className="break-words text-base font-medium">
                  {invite.recipientContact}
                </p>
                <dl className="mt-3 grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Assigned role</dt>
                  <dd>{roleLabels[invite.intendedRole]}</dd>
                  <dt className="text-muted-foreground">Incident</dt>
                  <dd>{invite.incidentId}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={invite.status} />
                  </dd>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd data-testid="invitation-expiry" className="break-words">
                    {new Date(Number(invite.expiresAt)).toLocaleString()}
                  </dd>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {invitationActions(invite)}
                </div>
              </article>
            ))}
            {!ready && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading invitations…
              </p>
            )}
            {ready && !invitations.length && (
              <p className="text-sm text-muted-foreground">
                No pending invitations.
              </p>
            )}
            {error && !revoke && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}
            <Link
              className="block text-sm underline underline-offset-4"
              href={`/org/${access.organizationId}/invitations`}
            >
              View all invitations →
            </Link>
          </div>
        </Disclosure>
      ) : (
        <>
          <div className="mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-[40px]">
                Invitations
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                One-hour, single-use access invitations for your organization.
              </p>
            </div>
            <InviteResponder />
          </div>
          <div className="mb-6 flex gap-5 text-xs text-muted-foreground">
            <Link
              href={`/org/${access.organizationId}/members`}
              className="underline underline-offset-4"
            >
              Manage members
            </Link>
            <span>Delivery: simulated</span>
          </div>
          {error && !revoke && (
            <p role="alert" className="mb-4 text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Recipient</TableHead>
                  <TableHead>Assigned role</TableHead>
                  <TableHead>Incident</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right pr-5">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="pl-5">
                      {invite.recipientContact}
                    </TableCell>
                    <TableCell>{roleLabels[invite.intendedRole]}</TableCell>
                    <TableCell>{invite.incidentId}</TableCell>
                    <TableCell>
                      <StatusBadge status={invite.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(Number(invite.expiresAt)).toLocaleString()}
                    </TableCell>
                    <TableCell className="space-x-2 text-right pr-5">
                      {invitationActions(invite)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!ready && (
              <p role="status" className="p-6 text-sm text-muted-foreground">
                Loading invitations…
              </p>
            )}
            {ready && !invitations.length && (
              <p className="p-6 text-sm text-muted-foreground">
                No invitations yet. Invite a responder to get started.
              </p>
            )}
          </div>
        </>
      )}
      <Dialog
        open={!!replacementId}
        onOpenChange={(open) => {
          if (!open) setReplacementId(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace this invitation?</DialogTitle>
            <DialogDescription>
              The current activation link will stop working. A new one-time link
              will be valid for one hour.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!pending}
              onClick={() => setReplacementId(undefined)}
            >
              Cancel
            </Button>
            <Button
              disabled={!!pending}
              onClick={async () => {
                if (replacementId) {
                  if (await replace(replacementId)) setReplacementId(undefined);
                }
              }}
            >
              Confirm replacement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!result}
        onOpenChange={(open) => {
          if (!open) setResult(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replacement invitation created</DialogTitle>
            <DialogDescription>
              The previous link has been invalidated.
            </DialogDescription>
          </DialogHeader>
          {result && <DeliveryPanel result={result} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!revoke}
        onOpenChange={(open) => {
          if (!open) setRevoke(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this invitation?</DialogTitle>
            <DialogDescription>
              The recipient will no longer be able to use this activation link.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoke(undefined)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!!pending}
              onClick={revokeInvitation}
            >
              Confirm invitation revocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function AuditPanel() {
  const access = useAccess();
  const [events] = useTable(tables.visibleAudit);
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-sm font-medium">Access activity</h2>
      <div className="divide-y divide-border rounded-lg border border-border">
        {[...events]
          .filter((e) => e.organizationId === access.organizationId)
          .sort((a, b) => (a.id > b.id ? -1 : 1))
          .slice(0, 12)
          .map((event) => (
            <div
              key={event.id.toString()}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs"
            >
              <span>
                {event.action.replaceAll(".", " ").replaceAll("_", " ")}{" "}
                <span className="text-muted-foreground">
                  {event.targetUserId && `· ${event.targetUserId}`}
                </span>
              </span>
              <span className="flex items-center gap-4">
                <span
                  className={
                    event.outcome === "denied"
                      ? "text-red-400"
                      : "text-emerald-400"
                  }
                >
                  {event.outcome}
                </span>
                <time className="text-muted-foreground">
                  {event.timestamp.toDate().toLocaleTimeString()}
                </time>
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}

function uniqueOrganizationMembers<
  T extends { organizationId: string; userId: string; incidentId: string },
>(rows: readonly T[], org: string, incident: string): T[] {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (row.organizationId !== org) continue;
    const old = result.get(row.userId);
    if (!old || row.incidentId === incident) result.set(row.userId, row);
  }
  return [...result.values()];
}
